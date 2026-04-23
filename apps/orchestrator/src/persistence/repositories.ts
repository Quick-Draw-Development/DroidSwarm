import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import {
  AgentAssignmentRecord,
  ArtifactMemoryIndexEntry,
  ArtifactRecord,
  BudgetEventRecord,
  CheckpointRecord,
  CheckpointVectorRecord,
  HandoffPacket,
  ProjectCheckpoint,
  ProjectDecision,
  ProjectFact,
  RepoTarget,
  TaskStateDigest,
  TaskChatMessage,
  OperatorControlActionRecord,
  PersistedTask,
  RunRecord,
  SwarmTopologySnapshot,
  TaskAttemptRecord,
  TaskDependencyRecord,
  VerificationOutcomeRecord,
  ExecutionEventRecord,
  WorkerHeartbeat,
  WorkerResultRecord,
} from '../types';
import { buildEmbedding, cosineSimilarity } from '../utils/embeddings';

const nowIso = (): string => new Date().toISOString();

const parseJson = <T>(value: string | null | undefined): T | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

type RunRow = {
  run_id: string;
  project_id: string;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  status: RunRecord['status'];
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type ExecutionEventRow = {
  event_id: string;
  run_id: string;
  event_type: ExecutionEventRecord['eventType'];
  detail: string;
  metadata_json?: string | null;
  created_at: string;
};

type TaskRow = {
  task_id: string;
  run_id: string;
  project_id?: string | null;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  parent_task_id?: string | null;
  name: string;
  status: PersistedTask['status'];
  priority: PersistedTask['priority'];
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type TaskAttemptRow = {
  attempt_id: string;
  task_id: string;
  run_id: string;
  project_id?: string | null;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  agent_name: string;
  status: TaskAttemptRecord['status'];
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type ArtifactRow = {
  artifact_id: string;
  attempt_id: string;
  task_id: string;
  run_id: string;
  project_id?: string | null;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  kind: string;
  summary: string;
  content: string;
  metadata_json?: string | null;
  created_at: string;
};

type CheckpointRow = {
  checkpoint_id: string;
  task_id: string;
  run_id: string;
  project_id?: string | null;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  attempt_id?: string | null;
  payload_json: string;
  created_at: string;
};

type TaskDependencyRow = {
  dependency_id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at?: string;
};

type BudgetEventRow = {
  event_id: string;
  run_id: string;
  project_id?: string | null;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  task_id?: string | null;
  detail: string;
  consumed: number;
  created_at: string;
};

type OperatorActionRow = {
  action_id: string;
  run_id: string;
  task_id?: string | null;
  action_type: string;
  detail: string;
  metadata_json?: string | null;
  created_at: string;
};

type VerificationOutcomeRow = {
  review_id: string;
  run_id: string;
  task_id: string;
  attempt_id?: string | null;
  stage: string;
  status: string;
  summary?: string | null;
  details?: string | null;
  reviewer?: string | null;
  created_at: string;
};

type ProjectRow = {
  project_id: string;
  name: string;
  description?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectRepoRow = {
  repo_id: string;
  project_id: string;
  name: string;
  root_path: string;
  default_branch: string;
  main_branch: string;
  develop_branch: string;
  allowed_roots_json: string;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectFactRow = {
  fact_id: string;
  project_id: string;
  repo_id: string;
  scope: string;
  statement: string;
  confidence: number;
  evidence_refs_json: string;
  status: ProjectFact['status'];
  created_at: string;
};

type ProjectDecisionRow = {
  decision_id: string;
  project_id: string;
  repo_id: string;
  summary: string;
  why: string;
  alternatives_rejected_json: string;
  evidence_refs_json: string;
  created_at: string;
};

type ProjectCheckpointRow = {
  project_checkpoint_id: string;
  project_id: string;
  repo_id: string;
  run_id: string;
  summary: string;
  facts_json: string;
  decisions_json: string;
  open_questions_json: string;
  component_summaries_json: string;
  created_at: string;
};

type TaskChatMessageRow = {
  message_id: string;
  task_id: string;
  run_id: string;
  project_id: string;
  repo_id?: string | null;
  root_path?: string | null;
  branch?: string | null;
  workspace_id?: string | null;
  source: TaskChatMessage['source'];
  external_thread_id?: string | null;
  external_message_id?: string | null;
  author_type: TaskChatMessage['authorType'];
  author_id: string;
  body: string;
  metadata_json?: string | null;
  created_at: string;
};

type WorkerResultRow = {
  worker_result_id: string;
  run_id: string;
  task_id: string;
  attempt_id: string;
  project_id: string;
  repo_id: string;
  root_path: string;
  branch: string;
  workspace_id?: string | null;
  engine: string;
  model?: string | null;
  model_tier?: string | null;
  queue_depth?: number | null;
  fallback_count?: number | null;
  success: number;
  summary: string;
  payload_json: string;
  created_at: string;
};

type WorkerHeartbeatRow = {
  heartbeat_id: string;
  run_id: string;
  task_id: string;
  attempt_id: string;
  project_id: string;
  repo_id: string;
  root_path: string;
  branch: string;
  workspace_id?: string | null;
  engine: string;
  model_tier?: string | null;
  queue_depth?: number | null;
  fallback_count?: number | null;
  heartbeat_status: WorkerHeartbeat['status'];
  elapsed_ms: number;
  last_activity?: string | null;
  created_at: string;
};

type TaskStateDigestRow = {
  digest_id: string;
  task_id: string;
  run_id: string;
  project_id: string;
  updated_by: string;
  payload_json: string;
  created_at: string;
};

type HandoffPacketRow = {
  packet_id: string;
  task_id: string;
  run_id: string;
  project_id: string;
  from_task_id: string;
  to_task_id?: string | null;
  to_role: string;
  digest_id: string;
  payload_json: string;
  created_at: string;
};

type ArtifactMemoryIndexRow = {
  artifact_memory_id: string;
  task_id: string;
  run_id: string;
  project_id: string;
  artifact_id: string;
  kind: string;
  short_summary: string;
  reason_relevant: string;
  trust_confidence: number;
  source_task_id: string;
  superseded_by?: string | null;
  created_at: string;
  updated_at: string;
};


export class RunRepository {
  constructor(private readonly database: Database.Database) {}

  create(run: RunRecord): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO runs (
          run_id, project_id, repo_id, root_path, branch, workspace_id, status, metadata_json, created_at, updated_at
        ) VALUES (
          @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @status, @metadataJson, @createdAt, @updatedAt
        )
      `)
      .run({
        runId: run.runId,
        projectId: run.projectId,
        repoId: run.repoId ?? null,
        rootPath: run.rootPath ?? null,
        branch: run.branch ?? null,
        workspaceId: run.workspaceId ?? null,
        status: run.status,
        metadataJson: run.metadata ? JSON.stringify(run.metadata) : null,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
    });
  }

  get(runId: string): RunRecord | null {
    const row = this.database
      .prepare('SELECT * FROM runs WHERE run_id = ?')
      .get(runId) as RunRow | undefined;
    if (!row) {
      return null;
    }

    return {
      runId: row.run_id,
      projectId: row.project_id,
      repoId: row.repo_id ?? undefined,
      rootPath: row.root_path ?? undefined,
      branch: row.branch ?? undefined,
      workspaceId: row.workspace_id ?? undefined,
      status: row.status,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listByProject(projectId: string): RunRecord[] {
    return (this.database
      .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC')
      .all(projectId) as RunRow[])
      .map((row: RunRow) => ({
        runId: row.run_id,
        projectId: row.project_id,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        status: row.status,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  updateStatus(runId: string, status: RunRecord['status'], metadata?: Record<string, unknown>): void {
    const existing = this.get(runId);
    if (!existing) {
      return;
    }
    const updated: RunRecord = {
      ...existing,
      status,
      metadata: metadata ?? existing.metadata,
      updatedAt: nowIso(),
    };
    this.create(updated);
  }

  updateMetadata(runId: string, metadata: Record<string, unknown>): void {
    const existing = this.get(runId);
    if (!existing) {
      return;
    }
    this.create({
      ...existing,
      metadata,
      updatedAt: nowIso(),
    });
  }

  listActiveRuns(): RunRecord[] {
    return (this.database
      .prepare('SELECT * FROM runs WHERE status NOT IN (?, ?, ?) ORDER BY updated_at DESC')
      .all('completed', 'failed', 'cancelled') as RunRow[])
      .map((row: RunRow) => ({
        runId: row.run_id,
        projectId: row.project_id,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        status: row.status,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }
}

export class ExecutionEventRepository {
  constructor(private readonly database: Database.Database) {}

  record(event: ExecutionEventRecord): void {
    this.database
      .prepare(`
        INSERT INTO execution_events (
          event_id, run_id, task_id, event_type, normalized_verb, detail, transport_body_json, metadata_json, created_at
        ) VALUES (
          @eventId, @runId, @taskId, @eventType, @normalizedVerb, @detail, @transportBodyJson, @metadataJson, @createdAt
        )
      `)
      .run({
        eventId: event.eventId,
        runId: event.runId,
        taskId: event.taskId ?? null,
        eventType: event.eventType,
        normalizedVerb: event.normalizedVerb ?? null,
        detail: event.detail,
        transportBodyJson: event.transportBody ? JSON.stringify(event.transportBody) : null,
        metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
        createdAt: event.createdAt,
      });
  }
}

export class TaskRepository {
  constructor(private readonly database: Database.Database) {}

  create(task: PersistedTask): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO tasks (
          task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, parent_task_id, name, status, priority, metadata_json, created_at, updated_at
        ) VALUES (
          @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @parentTaskId, @name, @status, @priority, @metadataJson, @createdAt, @updatedAt
        )
      `)
      .run({
        taskId: task.taskId,
        runId: task.runId,
        projectId: task.projectId ?? null,
        repoId: task.repoId ?? null,
        rootPath: task.rootPath ?? null,
        branch: task.branch ?? null,
        workspaceId: task.workspaceId ?? null,
        parentTaskId: task.parentTaskId ?? null,
        name: task.name,
        status: task.status,
        priority: task.priority,
        metadataJson: task.metadata ? JSON.stringify(task.metadata) : null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
  }

  listByRun(runId: string): PersistedTask[] {
    return (this.database
      .prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as TaskRow[])
      .map((row: TaskRow) => ({
        taskId: row.task_id,
        runId: row.run_id,
        projectId: row.project_id ?? undefined,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        parentTaskId: row.parent_task_id ?? undefined,
        name: row.name,
        status: row.status as PersistedTask['status'],
        priority: row.priority as PersistedTask['priority'],
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  get(taskId: string): PersistedTask | null {
    const row = this.database
      .prepare('SELECT * FROM tasks WHERE task_id = ?')
      .get(taskId) as TaskRow | undefined;
    if (!row) {
      return null;
    }

    return {
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? undefined,
      repoId: row.repo_id ?? undefined,
      rootPath: row.root_path ?? undefined,
      branch: row.branch ?? undefined,
      workspaceId: row.workspace_id ?? undefined,
      parentTaskId: row.parent_task_id ?? undefined,
      name: row.name,
      status: row.status as PersistedTask['status'],
      priority: row.priority as PersistedTask['priority'],
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class TaskAttemptRepository {
  constructor(private readonly database: Database.Database) {}

  create(attempt: TaskAttemptRecord): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO task_attempts (
          attempt_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, agent_name, status, metadata_json, created_at, updated_at
        ) VALUES (
          @attemptId, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @agentName, @status, @metadataJson, @createdAt, @updatedAt
        )
      `)
      .run({
        attemptId: attempt.attemptId,
        taskId: attempt.taskId,
        runId: attempt.runId,
        projectId: attempt.projectId ?? null,
        repoId: attempt.repoId ?? null,
        rootPath: attempt.rootPath ?? null,
        branch: attempt.branch ?? null,
        workspaceId: attempt.workspaceId ?? null,
        agentName: attempt.agentName,
        status: attempt.status,
        metadataJson: attempt.metadata ? JSON.stringify(attempt.metadata) : null,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
      });
  }

  updateStatus(
    attemptId: string,
    status: TaskAttemptRecord['status'],
    metadata?: Record<string, unknown>,
  ): void {
    this.database
      .prepare(`
        UPDATE task_attempts
        SET status = @status, metadata_json = @metadataJson, updated_at = @updatedAt
        WHERE attempt_id = @attemptId
      `)
      .run({
        attemptId,
        status,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
        updatedAt: nowIso(),
      });
  }

  updateMetadata(attemptId: string, metadata?: Record<string, unknown>): void {
    this.database
      .prepare(`
        UPDATE task_attempts
        SET metadata_json = @metadataJson, updated_at = @updatedAt
        WHERE attempt_id = @attemptId
      `)
      .run({
        attemptId,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
        updatedAt: nowIso(),
      });
  }

  listByTask(taskId: string): TaskAttemptRecord[] {
    return (this.database
      .prepare('SELECT * FROM task_attempts WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as TaskAttemptRow[])
      .map((row: TaskAttemptRow) => ({
        attemptId: row.attempt_id,
        taskId: row.task_id,
        runId: row.run_id,
        projectId: row.project_id ?? undefined,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        agentName: row.agent_name,
        status: row.status as TaskAttemptRecord['status'],
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  getById(attemptId: string): TaskAttemptRecord | null {
    const row = this.database
      .prepare('SELECT * FROM task_attempts WHERE attempt_id = ?')
      .get(attemptId) as TaskAttemptRow | undefined;
    if (!row) {
      return null;
    }

    return {
      attemptId: row.attempt_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? undefined,
      repoId: row.repo_id ?? undefined,
      rootPath: row.root_path ?? undefined,
      branch: row.branch ?? undefined,
      workspaceId: row.workspace_id ?? undefined,
      agentName: row.agent_name,
      status: row.status as TaskAttemptRecord['status'],
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listByRun(runId: string): TaskAttemptRecord[] {
    return (this.database
      .prepare('SELECT * FROM task_attempts WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as TaskAttemptRow[])
      .map((row: TaskAttemptRow) => ({
        attemptId: row.attempt_id,
        taskId: row.task_id,
        runId: row.run_id,
        projectId: row.project_id ?? undefined,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        agentName: row.agent_name,
        status: row.status as TaskAttemptRecord['status'],
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }
}

export class AgentAssignmentRepository {
  constructor(private readonly database: Database.Database) {}

  assign(agent: AgentAssignmentRecord): void {
    this.database
      .prepare(`
        INSERT INTO agent_assignments (
          assignment_id, attempt_id, agent_name, assigned_at
        ) VALUES (
          @assignmentId, @attemptId, @agentName, @assignedAt
        )
      `)
      .run({
        assignmentId: agent.assignmentId,
        attemptId: agent.attemptId,
        agentName: agent.agentName,
        assignedAt: agent.assignedAt,
      });
  }

  listByAttemptIds(attemptIds: string[]): AgentAssignmentRecord[] {
    if (attemptIds.length === 0) {
      return [];
    }
    const placeholders = attemptIds.map(() => '?').join(', ');
    return (this.database
      .prepare(`SELECT * FROM agent_assignments WHERE attempt_id IN (${placeholders}) ORDER BY assigned_at ASC`)
      .all(...attemptIds) as Array<{ assignment_id: string; attempt_id: string; agent_name: string; assigned_at: string }>)
      .map((row: { assignment_id: string; attempt_id: string; agent_name: string; assigned_at: string }) => ({
        assignmentId: row.assignment_id,
        attemptId: row.attempt_id,
        agentName: row.agent_name,
        assignedAt: row.assigned_at,
      }));
  }
}

export class ArtifactRepository {
  constructor(private readonly database: Database.Database) {}

  create(artifact: ArtifactRecord): void {
    this.database
      .prepare(`
        INSERT INTO artifacts (
          artifact_id, attempt_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, kind, summary, content, metadata_json, created_at
        ) VALUES (
          @artifactId, @attemptId, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @kind, @summary, @content, @metadataJson, @createdAt
        )
      `)
      .run({
        artifactId: artifact.artifactId,
        attemptId: artifact.attemptId,
        taskId: artifact.taskId,
        runId: artifact.runId,
        projectId: artifact.projectId ?? null,
        repoId: artifact.repoId ?? null,
        rootPath: artifact.rootPath ?? null,
        branch: artifact.branch ?? null,
        workspaceId: artifact.workspaceId ?? null,
        kind: artifact.kind,
        summary: artifact.summary,
        content: artifact.content,
        metadataJson: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
        createdAt: artifact.createdAt,
      });
  }

  listByTask(taskId: string): ArtifactRecord[] {
    return (this.database
      .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as ArtifactRow[])
      .map((row: ArtifactRow) => ({
        artifactId: row.artifact_id,
        attemptId: row.attempt_id,
        taskId: row.task_id,
        runId: row.run_id,
        projectId: row.project_id ?? undefined,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        kind: row.kind,
        summary: row.summary,
        content: row.content,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        createdAt: row.created_at,
      }));
  }
}

export class CheckpointRepository {
  constructor(private readonly database: Database.Database) {}

  create(checkpoint: CheckpointRecord): void {
    this.database
      .prepare(`
        INSERT INTO checkpoints (
          checkpoint_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, attempt_id, payload_json, created_at
        ) VALUES (
          @checkpointId, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @attemptId, @payloadJson, @createdAt
        )
      `)
      .run({
        checkpointId: checkpoint.checkpointId,
        taskId: checkpoint.taskId,
        runId: checkpoint.runId,
        projectId: checkpoint.projectId ?? null,
        repoId: checkpoint.repoId ?? null,
        rootPath: checkpoint.rootPath ?? null,
        branch: checkpoint.branch ?? null,
        workspaceId: checkpoint.workspaceId ?? null,
        attemptId: checkpoint.attemptId ?? null,
        payloadJson: checkpoint.payloadJson,
        createdAt: checkpoint.createdAt,
    });
  }

  getLatestForTask(taskId: string): CheckpointRecord | null {
    const row = this.database
      .prepare('SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(taskId) as CheckpointRow | undefined;
    if (!row) {
      return null;
    }
    return {
      checkpointId: row.checkpoint_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? undefined,
      repoId: row.repo_id ?? undefined,
      rootPath: row.root_path ?? undefined,
      branch: row.branch ?? undefined,
      workspaceId: row.workspace_id ?? undefined,
      attemptId: row.attempt_id ?? undefined,
      payloadJson: row.payload_json,
      createdAt: row.created_at,
    };
  }
}

type CheckpointVectorRow = {
  checkpoint_id: string;
  task_id: string;
  run_id: string;
  summary?: string | null;
  content?: string | null;
  embedding_json: string;
  created_at: string;
};

export class CheckpointVectorRepository {
  constructor(private readonly database: Database.Database) {}

  record(entry: {
    checkpointId: string;
    taskId: string;
    runId: string;
    summary?: string;
    content?: string;
    embedding: number[];
    createdAt: string;
  }): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare('DELETE FROM checkpoint_vectors WHERE checkpoint_id = ?')
        .run(entry.checkpointId);
      this.database
        .prepare('DELETE FROM checkpoint_vectors_search WHERE checkpoint_id = ?')
        .run(entry.checkpointId);
      this.database
        .prepare(
          `INSERT INTO checkpoint_vectors (
            checkpoint_id, task_id, run_id, summary, content, embedding_json, created_at
          ) VALUES (
            @checkpointId, @taskId, @runId, @summary, @content, @embeddingJson, @createdAt
          )`,
        )
        .run({
          checkpointId: entry.checkpointId,
          taskId: entry.taskId,
          runId: entry.runId,
          summary: entry.summary ?? null,
          content: entry.content ?? null,
          embeddingJson: JSON.stringify(entry.embedding),
          createdAt: entry.createdAt,
        });
      this.database
        .prepare('INSERT INTO checkpoint_vectors_search (checkpoint_id, summary, content) VALUES (?, ?, ?)')
        .run(entry.checkpointId, entry.summary ?? '', entry.content ?? '');
    });
    transaction();
  }

  search(query: string, limit: number): CheckpointVectorRecord[] {
    const queryEmbedding = buildEmbedding(query);
    const rows = this.database
      .prepare(
        `SELECT c.*, c.embedding_json FROM checkpoint_vectors c
         JOIN checkpoint_vectors_search fts ON c.checkpoint_id = fts.checkpoint_id
         WHERE checkpoint_vectors_search MATCH ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(query, limit) as CheckpointVectorRow[];

    return rows
      .map((row) => {
        const embedding = JSON.parse(row.embedding_json) as number[];
        return {
          checkpointId: row.checkpoint_id,
          taskId: row.task_id,
          runId: row.run_id,
          summary: row.summary ?? undefined,
          content: row.content ?? undefined,
          embedding,
          createdAt: row.created_at,
          score: cosineSimilarity(queryEmbedding, embedding),
        };
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}

export class BudgetEventRepository {
  constructor(private readonly database: Database.Database) {}

  record(event: BudgetEventRecord): void {
    this.database
      .prepare(`
        INSERT INTO budget_events (
          event_id, run_id, project_id, repo_id, root_path, branch, workspace_id, task_id, detail, consumed, created_at
        ) VALUES (
          @eventId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @taskId, @detail, @consumed, @createdAt
        )
      `)
      .run({
        eventId: event.eventId,
        runId: event.runId,
        projectId: event.projectId ?? null,
        repoId: event.repoId ?? null,
        rootPath: event.rootPath ?? null,
        branch: event.branch ?? null,
        workspaceId: event.workspaceId ?? null,
        taskId: event.taskId ?? null,
        detail: event.detail,
        consumed: event.consumed,
        createdAt: event.createdAt,
    });
  }

  listByTask(taskId: string): BudgetEventRecord[] {
    return (this.database
      .prepare('SELECT * FROM budget_events WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as BudgetEventRow[])
      .map((row: BudgetEventRow) => ({
        eventId: row.event_id,
        runId: row.run_id,
        projectId: row.project_id ?? undefined,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        taskId: row.task_id ?? undefined,
        detail: row.detail,
        consumed: row.consumed,
        createdAt: row.created_at,
      }));
  }

  listByRun(runId: string): BudgetEventRecord[] {
    return (this.database
      .prepare('SELECT * FROM budget_events WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as BudgetEventRow[])
      .map((row: BudgetEventRow) => ({
        eventId: row.event_id,
        runId: row.run_id,
        projectId: row.project_id ?? undefined,
        repoId: row.repo_id ?? undefined,
        rootPath: row.root_path ?? undefined,
        branch: row.branch ?? undefined,
        workspaceId: row.workspace_id ?? undefined,
        taskId: row.task_id ?? undefined,
        detail: row.detail,
        consumed: row.consumed,
        createdAt: row.created_at,
      }));
  }
}

export class OperatorActionRepository {
  constructor(private readonly database: Database.Database) {}

  record(action: OperatorControlActionRecord): void {
    this.database
      .prepare(`
        INSERT INTO operator_actions (
          action_id, run_id, task_id, action_type, detail, metadata_json, created_at
        ) VALUES (
          @actionId, @runId, @taskId, @actionType, @detail, @metadataJson, @createdAt
        )
      `)
      .run({
        actionId: action.actionId,
        runId: action.runId,
        taskId: action.taskId ?? null,
        actionType: action.actionType,
        detail: action.detail,
        metadataJson: action.metadataJson ?? null,
        createdAt: action.createdAt,
    });
  }

  listByTask(taskId: string): OperatorControlActionRecord[] {
    return (this.database
      .prepare('SELECT * FROM operator_actions WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as OperatorActionRow[])
      .map((row: OperatorActionRow) => ({
        actionId: row.action_id,
        runId: row.run_id,
        taskId: row.task_id ?? undefined,
        actionType: row.action_type as OperatorControlActionRecord['actionType'],
        detail: row.detail,
        metadataJson: row.metadata_json ?? undefined,
        createdAt: row.created_at,
      }));
  }
}

export class TaskDependencyRepository {
  constructor(private readonly database: Database.Database) {}

  add(dependency: TaskDependencyRecord): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO task_dependencies (
          dependency_id, task_id, depends_on_task_id, created_at
        ) VALUES (
          @dependencyId, @taskId, @dependsOnTaskId, @createdAt
        )
      `)
      .run({
        dependencyId: dependency.dependencyId,
        taskId: dependency.taskId,
        dependsOnTaskId: dependency.dependsOnTaskId,
        createdAt: dependency.createdAt,
      });
  }

  listDependencies(taskId: string): TaskDependencyRecord[] {
    return (this.database
      .prepare('SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as TaskDependencyRow[])
      .map((row: TaskDependencyRow) => ({
        dependencyId: row.dependency_id,
        taskId: row.task_id,
        dependsOnTaskId: row.depends_on_task_id,
        createdAt: row.created_at ?? '',
      }));
  }

  listDependents(taskId: string): TaskDependencyRecord[] {
    return (this.database
      .prepare('SELECT * FROM task_dependencies WHERE depends_on_task_id = ? ORDER BY created_at ASC')
      .all(taskId) as TaskDependencyRow[])
      .map((row: TaskDependencyRow) => ({
        dependencyId: row.dependency_id,
        taskId: row.task_id,
        dependsOnTaskId: row.depends_on_task_id,
        createdAt: row.created_at ?? '',
      }));
  }
}

export class VerificationOutcomeRepository {
  constructor(private readonly database: Database.Database) {}

  record(outcome: VerificationOutcomeRecord): void {
    this.database
      .prepare(`
        INSERT INTO verification_reviews (
          review_id, run_id, task_id, attempt_id, stage, status, summary, details, reviewer, created_at
        ) VALUES (
          @reviewId, @runId, @taskId, @attemptId, @stage, @status, @summary, @details, @reviewer, @createdAt
        )
      `)
      .run({
        reviewId: outcome.reviewId,
        runId: outcome.runId,
        taskId: outcome.taskId,
        attemptId: outcome.attemptId ?? null,
        stage: outcome.stage,
        status: outcome.status,
        summary: outcome.summary ?? null,
        details: outcome.details ?? null,
        reviewer: outcome.reviewer ?? null,
        createdAt: outcome.createdAt,
    });
  }

  listByTask(taskId: string): VerificationOutcomeRecord[] {
    return (this.database
      .prepare('SELECT * FROM verification_reviews WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as VerificationOutcomeRow[])
      .map((row: VerificationOutcomeRow) => ({
        reviewId: row.review_id,
        runId: row.run_id,
        taskId: row.task_id,
        attemptId: row.attempt_id ?? undefined,
        stage: row.stage as VerificationOutcomeRecord['stage'],
        status: row.status as VerificationOutcomeRecord['status'],
        summary: row.summary ?? undefined,
        details: row.details ?? undefined,
        reviewer: row.reviewer ?? undefined,
        createdAt: row.created_at,
      }));
  }
}

export class ProjectRepository {
  constructor(private readonly database: Database.Database) {}

  upsert(project: { projectId: string; name: string; description?: string; metadata?: Record<string, unknown>; createdAt: string; updatedAt: string }): void {
    this.database.prepare(`
      INSERT INTO projects (project_id, name, description, metadata_json, created_at, updated_at)
      VALUES (@projectId, @name, @description, @metadataJson, @createdAt, @updatedAt)
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run({
      projectId: project.projectId,
      name: project.name,
      description: project.description ?? null,
      metadataJson: project.metadata ? JSON.stringify(project.metadata) : null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  }

  list(): Array<{ projectId: string; name: string; description?: string; metadata?: Record<string, unknown>; createdAt: string; updatedAt: string }> {
    return (this.database.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[]).map((row: ProjectRow) => ({
      projectId: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}

export class ProjectRepoRepository {
  constructor(private readonly database: Database.Database) {}

  upsert(repo: RepoTarget & { name: string; createdAt: string; updatedAt: string; metadata?: Record<string, unknown> }): void {
    this.database.prepare(`
      INSERT INTO project_repos (
        repo_id, project_id, name, root_path, default_branch, main_branch, develop_branch, allowed_roots_json, metadata_json, created_at, updated_at
      ) VALUES (
        @repoId, @projectId, @name, @rootPath, @defaultBranch, @mainBranch, @developBranch, @allowedRootsJson, @metadataJson, @createdAt, @updatedAt
      )
      ON CONFLICT(repo_id) DO UPDATE SET
        name = excluded.name,
        root_path = excluded.root_path,
        default_branch = excluded.default_branch,
        main_branch = excluded.main_branch,
        develop_branch = excluded.develop_branch,
        allowed_roots_json = excluded.allowed_roots_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run({
      repoId: repo.repoId,
      projectId: repo.projectId,
      name: repo.name,
      rootPath: repo.rootPath,
      defaultBranch: repo.defaultBranch,
      mainBranch: repo.mainBranch,
      developBranch: repo.developBranch,
      allowedRootsJson: JSON.stringify(repo.allowedRoots),
      metadataJson: repo.metadata ? JSON.stringify(repo.metadata) : null,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
    });
  }

  listByProject(projectId: string): RepoTarget[] {
    return (this.database.prepare('SELECT * FROM project_repos WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as ProjectRepoRow[]).map((row: ProjectRepoRow) => ({
      id: row.repo_id,
      repoId: row.repo_id,
      projectId: row.project_id,
      name: row.name,
      rootPath: row.root_path,
      branch: row.default_branch,
      defaultBranch: row.default_branch,
      mainBranch: row.main_branch,
      developBranch: row.develop_branch,
      workspaceId: undefined,
      allowedRoots: parseJson<string[]>(row.allowed_roots_json) ?? [row.root_path],
    }));
  }

  get(repoId: string): RepoTarget | null {
    const row = this.database.prepare('SELECT * FROM project_repos WHERE repo_id = ?').get(repoId) as ProjectRepoRow | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.repo_id,
      repoId: row.repo_id,
      projectId: row.project_id,
      name: row.name,
      rootPath: row.root_path,
      branch: row.default_branch,
      defaultBranch: row.default_branch,
      mainBranch: row.main_branch,
      developBranch: row.develop_branch,
      workspaceId: undefined,
      allowedRoots: parseJson<string[]>(row.allowed_roots_json) ?? [row.root_path],
    };
  }
}

export class MemoryRepository {
  constructor(private readonly database: Database.Database) {}

  recordFact(fact: ProjectFact): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO project_facts (
        fact_id, project_id, repo_id, scope, statement, confidence, evidence_refs_json, status, created_at
      ) VALUES (
        @id, @projectId, @repoId, @scope, @statement, @confidence, @evidenceRefsJson, @status, @createdAt
      )
    `).run({
      ...fact,
      evidenceRefsJson: JSON.stringify(fact.evidenceRefs),
    });
  }

  recordDecision(decision: ProjectDecision): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO project_decisions (
        decision_id, project_id, repo_id, summary, why, alternatives_rejected_json, evidence_refs_json, created_at
      ) VALUES (
        @id, @projectId, @repoId, @summary, @why, @alternativesRejectedJson, @evidenceRefsJson, @createdAt
      )
    `).run({
      ...decision,
      alternativesRejectedJson: JSON.stringify(decision.alternativesRejected),
      evidenceRefsJson: JSON.stringify(decision.evidenceRefs),
    });
  }

  recordCheckpoint(checkpoint: ProjectCheckpoint): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO project_checkpoints (
        project_checkpoint_id, project_id, repo_id, run_id, summary, facts_json, decisions_json, open_questions_json, component_summaries_json, created_at
      ) VALUES (
        @id, @projectId, @repoId, @runId, @summary, @factsJson, @decisionsJson, @openQuestionsJson, @componentSummariesJson, @createdAt
      )
    `).run({
      ...checkpoint,
      factsJson: JSON.stringify(checkpoint.facts),
      decisionsJson: JSON.stringify(checkpoint.decisions),
      openQuestionsJson: JSON.stringify(checkpoint.openQuestions),
      componentSummariesJson: JSON.stringify(checkpoint.componentSummaries),
    });
  }

  listFacts(projectId: string): ProjectFact[] {
    return (this.database.prepare('SELECT * FROM project_facts WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as ProjectFactRow[]).map((row: ProjectFactRow) => ({
      id: row.fact_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      scope: row.scope,
      statement: row.statement,
      confidence: row.confidence,
      evidenceRefs: parseJson<string[]>(row.evidence_refs_json) ?? [],
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  listDecisions(projectId: string): ProjectDecision[] {
    return (this.database.prepare('SELECT * FROM project_decisions WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as ProjectDecisionRow[]).map((row: ProjectDecisionRow) => ({
      id: row.decision_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      summary: row.summary,
      why: row.why,
      alternativesRejected: parseJson<string[]>(row.alternatives_rejected_json) ?? [],
      evidenceRefs: parseJson<string[]>(row.evidence_refs_json) ?? [],
      createdAt: row.created_at,
    }));
  }

  listCheckpoints(projectId: string): ProjectCheckpoint[] {
    return (this.database.prepare('SELECT * FROM project_checkpoints WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as ProjectCheckpointRow[]).map((row: ProjectCheckpointRow) => ({
      id: row.project_checkpoint_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      runId: row.run_id,
      summary: row.summary,
      facts: parseJson<string[]>(row.facts_json) ?? [],
      decisions: parseJson<string[]>(row.decisions_json) ?? [],
      openQuestions: parseJson<string[]>(row.open_questions_json) ?? [],
      componentSummaries: parseJson<string[]>(row.component_summaries_json) ?? [],
      createdAt: row.created_at,
    }));
  }
}

export class ChatRepository {
  constructor(private readonly database: Database.Database) {}

  create(message: TaskChatMessage & { repoId?: string; rootPath?: string; branch?: string; workspaceId?: string }): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO task_chat_messages (
        message_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id,
        source, external_thread_id, external_message_id, author_type, author_id, body, metadata_json, created_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId,
        @source, @externalThreadId, @externalMessageId, @authorType, @authorId, @body, @metadataJson, @createdAt
      )
    `).run({
      ...message,
      repoId: message.repoId ?? null,
      rootPath: message.rootPath ?? null,
      branch: message.branch ?? null,
      workspaceId: message.workspaceId ?? null,
      externalThreadId: message.externalThreadId ?? null,
      externalMessageId: message.externalMessageId ?? null,
      metadataJson: message.metadata ? JSON.stringify(message.metadata) : null,
    });
  }

  listByTask(taskId: string): TaskChatMessage[] {
    return (this.database.prepare('SELECT * FROM task_chat_messages WHERE task_id = ? ORDER BY created_at ASC').all(taskId) as TaskChatMessageRow[]).map((row: TaskChatMessageRow) => ({
      id: row.message_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id,
      source: row.source,
      externalThreadId: row.external_thread_id ?? undefined,
      externalMessageId: row.external_message_id ?? undefined,
      authorType: row.author_type,
      authorId: row.author_id,
      body: row.body,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
    }));
  }
}

export class WorkerRepository {
  constructor(private readonly database: Database.Database) {}

  recordResult(record: WorkerResultRecord): void {
    this.database.prepare(`
      INSERT INTO worker_results (
        worker_result_id, run_id, task_id, attempt_id, project_id, repo_id, root_path, branch, workspace_id,
        engine, model, model_tier, queue_depth, fallback_count, success, summary, payload_json, created_at
      ) VALUES (
        @workerResultId, @runId, @taskId, @attemptId, @projectId, @repoId, @rootPath, @branch, @workspaceId,
        @engine, @model, @modelTier, @queueDepth, @fallbackCount, @success, @summary, @payloadJson, @createdAt
      )
    `).run({
      ...record,
      workspaceId: record.workspaceId ?? null,
      model: record.model ?? null,
      modelTier: record.modelTier ?? null,
      queueDepth: record.queueDepth ?? null,
      fallbackCount: record.fallbackCount ?? null,
      success: record.success ? 1 : 0,
    });
  }

  listResultsByTask(taskId: string): WorkerResultRecord[] {
    return (this.database.prepare('SELECT * FROM worker_results WHERE task_id = ? ORDER BY created_at DESC').all(taskId) as WorkerResultRow[]).map((row: WorkerResultRow) => ({
      workerResultId: row.worker_result_id,
      runId: row.run_id,
      taskId: row.task_id,
      attemptId: row.attempt_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      rootPath: row.root_path,
      branch: row.branch,
      workspaceId: row.workspace_id ?? undefined,
      engine: row.engine,
      model: row.model ?? undefined,
      modelTier: row.model_tier as WorkerResultRecord['modelTier'],
      queueDepth: row.queue_depth ?? undefined,
      fallbackCount: row.fallback_count ?? undefined,
      success: row.success === 1,
      summary: row.summary,
      payloadJson: row.payload_json,
      createdAt: row.created_at,
    }));
  }

  recordHeartbeat(record: WorkerHeartbeat & { heartbeatId: string; projectId: string; repoId: string; rootPath: string; branch: string; workspaceId?: string }): void {
    this.database.prepare(`
      INSERT INTO worker_heartbeats (
        heartbeat_id, run_id, task_id, attempt_id, project_id, repo_id, root_path, branch, workspace_id,
        engine, model_tier, queue_depth, fallback_count, heartbeat_status, elapsed_ms, last_activity, created_at
      ) VALUES (
        @heartbeatId, @runId, @taskId, @attemptId, @projectId, @repoId, @rootPath, @branch, @workspaceId,
        @engine, @modelTier, @queueDepth, @fallbackCount, @status, @elapsedMs, @lastActivity, @createdAt
      )
    `).run({
      heartbeatId: record.heartbeatId,
      runId: record.runId,
      taskId: record.taskId,
      attemptId: record.attemptId,
      projectId: record.projectId,
      repoId: record.repoId,
      rootPath: record.rootPath,
      branch: record.branch,
      workspaceId: record.workspaceId ?? null,
      engine: record.engine,
      modelTier: record.modelTier ?? null,
      queueDepth: record.queueDepth ?? null,
      fallbackCount: record.fallbackCount ?? null,
      status: record.status,
      elapsedMs: record.elapsedMs,
      lastActivity: record.lastActivity ?? null,
      createdAt: record.timestamp,
    });
  }

  listHeartbeatsByAttempt(attemptId: string): WorkerHeartbeat[] {
    return (this.database.prepare('SELECT * FROM worker_heartbeats WHERE attempt_id = ? ORDER BY created_at DESC').all(attemptId) as WorkerHeartbeatRow[]).map((row: WorkerHeartbeatRow) => ({
      runId: row.run_id,
      taskId: row.task_id,
      attemptId: row.attempt_id,
      engine: row.engine as WorkerHeartbeat['engine'],
      modelTier: row.model_tier as WorkerHeartbeat['modelTier'],
      queueDepth: row.queue_depth ?? undefined,
      fallbackCount: row.fallback_count ?? undefined,
      timestamp: row.created_at,
      elapsedMs: row.elapsed_ms,
      status: row.heartbeat_status,
      lastActivity: row.last_activity ?? undefined,
    }));
  }
}

export class TaskStateDigestRepository {
  constructor(private readonly database: Database.Database) {}

  record(digest: TaskStateDigest): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO task_state_digests (
        digest_id, task_id, run_id, project_id, updated_by, payload_json, created_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @updatedBy, @payloadJson, @createdAt
      )
    `).run({
      id: digest.id,
      taskId: digest.taskId,
      runId: digest.runId,
      projectId: digest.projectId,
      updatedBy: digest.lastUpdatedBy,
      payloadJson: JSON.stringify(digest),
      createdAt: digest.ts,
    });
  }

  getLatestForTask(taskId: string): TaskStateDigest | null {
    const row = this.database.prepare(`
      SELECT * FROM task_state_digests
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId) as TaskStateDigestRow | undefined;
    if (!row) {
      return null;
    }
    return parseJson<TaskStateDigest>(row.payload_json) ?? null;
  }

  listByTask(taskId: string): TaskStateDigest[] {
    return (this.database.prepare(`
      SELECT * FROM task_state_digests
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as TaskStateDigestRow[]).flatMap((row: TaskStateDigestRow) => {
      const parsed = parseJson<TaskStateDigest>(row.payload_json);
      return parsed ? [parsed] : [];
    });
  }
}

export class HandoffPacketRepository {
  constructor(private readonly database: Database.Database) {}

  record(packet: HandoffPacket): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO handoff_packets (
        packet_id, task_id, run_id, project_id, from_task_id, to_task_id, to_role, digest_id, payload_json, created_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @fromTaskId, @toTaskId, @toRole, @digestId, @payloadJson, @createdAt
      )
    `).run({
      ...packet,
      toTaskId: packet.toTaskId ?? null,
      payloadJson: JSON.stringify(packet),
      createdAt: packet.ts,
    });
  }

  listByTask(taskId: string): HandoffPacket[] {
    return (this.database.prepare(`
      SELECT * FROM handoff_packets
      WHERE task_id = ? OR from_task_id = ? OR to_task_id = ?
      ORDER BY created_at DESC
    `).all(taskId, taskId, taskId) as HandoffPacketRow[]).flatMap((row: HandoffPacketRow) => {
      const parsed = parseJson<HandoffPacket>(row.payload_json);
      return parsed ? [parsed] : [];
    });
  }

  getLatest(taskId: string, runId?: string): HandoffPacket | null {
    const row = runId
      ? this.database.prepare(`
        SELECT * FROM handoff_packets
        WHERE (task_id = ? OR from_task_id = ? OR to_task_id = ?)
          AND run_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(taskId, taskId, taskId, runId) as HandoffPacketRow | undefined
      : this.database.prepare(`
        SELECT * FROM handoff_packets
        WHERE task_id = ? OR from_task_id = ? OR to_task_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(taskId, taskId, taskId) as HandoffPacketRow | undefined;
    if (!row) {
      return null;
    }
    return parseJson<HandoffPacket>(row.payload_json) ?? null;
  }
}

export class ArtifactMemoryIndexRepository {
  constructor(private readonly database: Database.Database) {}

  record(entry: ArtifactMemoryIndexEntry): void {
    this.database.prepare(`
      INSERT OR REPLACE INTO task_artifact_memory (
        artifact_memory_id, task_id, run_id, project_id, artifact_id, kind, short_summary,
        reason_relevant, trust_confidence, source_task_id, superseded_by, created_at, updated_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @artifactId, @kind, @shortSummary,
        @reasonRelevant, @trustConfidence, @sourceTaskId, @supersededBy, @createdAt, @updatedAt
      )
    `).run({
      id: entry.id,
      taskId: entry.taskId,
      runId: entry.runId,
      projectId: entry.projectId,
      artifactId: entry.artifactId,
      kind: entry.kind,
      shortSummary: entry.shortSummary,
      reasonRelevant: entry.reasonRelevant,
      trustConfidence: entry.trustConfidence,
      sourceTaskId: entry.sourceTaskId,
      supersededBy: entry.supersededBy ?? null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  listByTask(taskId: string): ArtifactMemoryIndexEntry[] {
    return (this.database.prepare(`
      SELECT * FROM task_artifact_memory
      WHERE task_id = ?
      ORDER BY updated_at DESC
    `).all(taskId) as ArtifactMemoryIndexRow[]).map((row: ArtifactMemoryIndexRow) => ({
      id: row.artifact_memory_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id,
      artifactId: row.artifact_id,
      kind: row.kind,
      shortSummary: row.short_summary,
      reasonRelevant: row.reason_relevant,
      trustConfidence: row.trust_confidence,
      sourceTaskId: row.source_task_id,
      supersededBy: row.superseded_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}

export class PersistenceClient {
  constructor(
    public readonly database: Database.Database,
    public readonly runs: RunRepository,
    public readonly tasks: TaskRepository,
    public readonly attempts: TaskAttemptRepository,
    public readonly assignments: AgentAssignmentRepository,
    public readonly artifacts: ArtifactRepository,
    public readonly checkpoints: CheckpointRepository,
    public readonly budgets: BudgetEventRepository,
    public readonly actions: OperatorActionRepository,
    public readonly dependencies: TaskDependencyRepository,
    public readonly verifications: VerificationOutcomeRepository,
    public readonly executionEvents: ExecutionEventRepository,
    public readonly vectors: CheckpointVectorRepository,
    public readonly projects: ProjectRepository,
    public readonly projectRepos: ProjectRepoRepository,
    public readonly memory: MemoryRepository,
    public readonly chat: ChatRepository,
    public readonly workers: WorkerRepository,
    public readonly digests: TaskStateDigestRepository,
    public readonly handoffs: HandoffPacketRepository,
    public readonly artifactMemory: ArtifactMemoryIndexRepository,
  ) {}

  updateAttemptMetadata(attemptId: string, metadata?: Record<string, unknown>): void {
    this.attempts.updateMetadata(attemptId, metadata);
  }

  buildSwarmTopologySnapshot(runId: string): SwarmTopologySnapshot | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    const tasks = this.tasks.listByRun(runId);
    const attempts = this.attempts.listByRun(runId);
    const assignments = this.assignments.listByAttemptIds(attempts.map((attempt) => attempt.attemptId));
    const taskById = new Map(tasks.map((task) => [task.taskId, task] as const));
    const activeRoleCounts = new Map<string, number>();
    const helpers = attempts.map((attempt) => {
      const task = taskById.get(attempt.taskId);
      const role = typeof attempt.metadata?.role === 'string' ? attempt.metadata.role : 'unknown';
      activeRoleCounts.set(role, (activeRoleCounts.get(role) ?? 0) + (attempt.status === 'running' ? 1 : 0));
      const assigned = assignments.find((entry) => entry.attemptId === attempt.attemptId);
      const routingDecision = typeof attempt.metadata?.routing_decision === 'object' && attempt.metadata.routing_decision !== null
        ? attempt.metadata.routing_decision as Record<string, unknown>
        : undefined;
      return {
        attemptId: attempt.attemptId,
        taskId: attempt.taskId,
        taskName: task?.name ?? attempt.taskId,
        parentTaskId: task?.parentTaskId,
        role,
        agentName: assigned?.agentName ?? attempt.agentName,
        status: attempt.status,
        taskStatus: task?.status ?? 'queued',
        modelTier: typeof attempt.metadata?.model_tier === 'string' ? attempt.metadata.model_tier : undefined,
        routeKind: typeof routingDecision?.routeKind === 'string' ? routingDecision.routeKind : undefined,
        queueDepth: typeof attempt.metadata?.queue_depth === 'number' ? attempt.metadata.queue_depth : undefined,
        fallbackCount: typeof attempt.metadata?.fallback_count === 'number' ? attempt.metadata.fallback_count : undefined,
      };
    });

    return {
      runId,
      capturedAt: nowIso(),
      activeRoles: [...activeRoleCounts.entries()]
        .filter(([, count]) => count > 0)
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role)),
      helpers,
    };
  }

  static fromDatabase(database: Database.Database): PersistenceClient {
    return new PersistenceClient(
      database,
      new RunRepository(database),
      new TaskRepository(database),
      new TaskAttemptRepository(database),
      new AgentAssignmentRepository(database),
    new ArtifactRepository(database),
    new CheckpointRepository(database),
    new BudgetEventRepository(database),
    new OperatorActionRepository(database),
    new TaskDependencyRepository(database),
      new VerificationOutcomeRepository(database),
      new ExecutionEventRepository(database),
      new CheckpointVectorRepository(database),
      new ProjectRepository(database),
      new ProjectRepoRepository(database),
      new MemoryRepository(database),
      new ChatRepository(database),
      new WorkerRepository(database),
      new TaskStateDigestRepository(database),
      new HandoffPacketRepository(database),
      new ArtifactMemoryIndexRepository(database),
    );
  }

  createRun(projectId: string, scope?: { repoId?: string; rootPath?: string; branch?: string; workspaceId?: string; metadata?: Record<string, unknown> }): RunRecord {
    const run: RunRecord = {
      runId: randomUUID(),
      projectId,
      repoId: scope?.repoId,
      rootPath: scope?.rootPath,
      branch: scope?.branch,
      workspaceId: scope?.workspaceId,
      status: 'queued',
      metadata: scope?.metadata ?? {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.runs.create(run);
    return run;
  }

  recordExecutionEvent(
    runId: string,
    eventType: ExecutionEventRecord['eventType'],
    detail: string,
    metadata?: Record<string, unknown>,
    options?: {
      taskId?: string;
      normalizedVerb?: ExecutionEventRecord['normalizedVerb'];
      transportBody?: Record<string, unknown>;
    },
  ): void {
    this.executionEvents.record({
      eventId: randomUUID(),
      runId,
      taskId: options?.taskId,
      eventType,
      detail,
      normalizedVerb: options?.normalizedVerb,
      transportBody: options?.transportBody,
      metadata,
      createdAt: nowIso(),
    });
  }

}
