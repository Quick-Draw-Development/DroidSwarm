import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import {
  AgentAssignmentRecord,
  ArtifactRecord,
  BudgetEventRecord,
  CheckpointRecord,
  CheckpointVectorRecord,
  OperatorControlActionRecord,
  PersistedTask,
  RunRecord,
  TaskAttemptRecord,
  TaskDependencyRecord,
  VerificationOutcomeRecord,
  ExecutionEventRecord,
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


export class RunRepository {
  constructor(private readonly database: Database.Database) {}

  create(run: RunRecord): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO runs (
          run_id, project_id, status, metadata_json, created_at, updated_at
        ) VALUES (
          @runId, @projectId, @status, @metadataJson, @createdAt, @updatedAt
        )
      `)
      .run({
        runId: run.runId,
        projectId: run.projectId,
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
      status: row.status,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listByProject(projectId: string): RunRecord[] {
    return this.database
      .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC')
      .all(projectId)
      .map((row: RunRow) => ({
        runId: row.run_id,
        projectId: row.project_id,
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

  listActiveRuns(): RunRecord[] {
    return this.database
      .prepare('SELECT * FROM runs WHERE status NOT IN (?, ?, ?) ORDER BY updated_at DESC')
      .all('completed', 'failed', 'cancelled')
      .map((row: RunRow) => ({
        runId: row.run_id,
        projectId: row.project_id,
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
          event_id, run_id, event_type, detail, metadata_json, created_at
        ) VALUES (
          @eventId, @runId, @eventType, @detail, @metadataJson, @createdAt
        )
      `)
      .run({
        eventId: event.eventId,
        runId: event.runId,
        eventType: event.eventType,
        detail: event.detail,
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
          task_id, run_id, parent_task_id, name, status, priority, metadata_json, created_at, updated_at
        ) VALUES (
          @taskId, @runId, @parentTaskId, @name, @status, @priority, @metadataJson, @createdAt, @updatedAt
        )
      `)
      .run({
        taskId: task.taskId,
        runId: task.runId,
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
    return this.database
      .prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId)
      .map((row: TaskRow) => ({
        taskId: row.task_id,
        runId: row.run_id,
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
          attempt_id, task_id, run_id, agent_name, status, metadata_json, created_at, updated_at
        ) VALUES (
          @attemptId, @taskId, @runId, @agentName, @status, @metadataJson, @createdAt, @updatedAt
        )
      `)
      .run({
        attemptId: attempt.attemptId,
        taskId: attempt.taskId,
        runId: attempt.runId,
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
    return this.database
      .prepare('SELECT * FROM task_attempts WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
      .map((row: TaskAttemptRow) => ({
        attemptId: row.attempt_id,
        taskId: row.task_id,
        runId: row.run_id,
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
      agentName: row.agent_name,
      status: row.status as TaskAttemptRecord['status'],
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
}

export class ArtifactRepository {
  constructor(private readonly database: Database.Database) {}

  create(artifact: ArtifactRecord): void {
    this.database
      .prepare(`
        INSERT INTO artifacts (
          artifact_id, attempt_id, task_id, run_id, kind, summary, content, metadata_json, created_at
        ) VALUES (
          @artifactId, @attemptId, @taskId, @runId, @kind, @summary, @content, @metadataJson, @createdAt
        )
      `)
      .run({
        artifactId: artifact.artifactId,
        attemptId: artifact.attemptId,
        taskId: artifact.taskId,
        runId: artifact.runId,
        kind: artifact.kind,
        summary: artifact.summary,
        content: artifact.content,
        metadataJson: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
        createdAt: artifact.createdAt,
      });
  }

  listByTask(taskId: string): ArtifactRecord[] {
    return this.database
      .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
      .map((row: ArtifactRow) => ({
        artifactId: row.artifact_id,
        attemptId: row.attempt_id,
        taskId: row.task_id,
        runId: row.run_id,
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
          checkpoint_id, task_id, run_id, attempt_id, payload_json, created_at
        ) VALUES (
          @checkpointId, @taskId, @runId, @attemptId, @payloadJson, @createdAt
        )
      `)
      .run({
        checkpointId: checkpoint.checkpointId,
        taskId: checkpoint.taskId,
        runId: checkpoint.runId,
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
          event_id, run_id, task_id, detail, consumed, created_at
        ) VALUES (
          @eventId, @runId, @taskId, @detail, @consumed, @createdAt
        )
      `)
      .run({
        eventId: event.eventId,
        runId: event.runId,
        taskId: event.taskId ?? null,
        detail: event.detail,
        consumed: event.consumed,
        createdAt: event.createdAt,
    });
  }

  listByTask(taskId: string): BudgetEventRecord[] {
    return this.database
      .prepare('SELECT * FROM budget_events WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
      .map((row: BudgetEventRow) => ({
        eventId: row.event_id,
        runId: row.run_id,
        taskId: row.task_id ?? undefined,
        detail: row.detail,
        consumed: row.consumed,
        createdAt: row.created_at,
      }));
  }

  listByRun(runId: string): BudgetEventRecord[] {
    return this.database
      .prepare('SELECT * FROM budget_events WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId)
      .map((row: BudgetEventRow) => ({
        eventId: row.event_id,
        runId: row.run_id,
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
    return this.database
      .prepare('SELECT * FROM operator_actions WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
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
    return this.database
      .prepare('SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
      .map((row: TaskDependencyRow) => ({
        dependencyId: row.dependency_id,
        taskId: row.task_id,
        dependsOnTaskId: row.depends_on_task_id,
        createdAt: row.created_at ?? '',
      }));
  }

  listDependents(taskId: string): TaskDependencyRecord[] {
    return this.database
      .prepare('SELECT * FROM task_dependencies WHERE depends_on_task_id = ? ORDER BY created_at ASC')
      .all(taskId)
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
    return this.database
      .prepare('SELECT * FROM verification_reviews WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
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
  ) {}

  updateAttemptMetadata(attemptId: string, metadata?: Record<string, unknown>): void {
    this.attempts.updateMetadata(attemptId, metadata);
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
  );
}

  createRun(projectId: string): RunRecord {
    const run: RunRecord = {
      runId: randomUUID(),
      projectId,
      status: 'queued',
      metadata: {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.runs.create(run);
    return run;
  }

  recordExecutionEvent(runId: string, eventType: ExecutionEventRecord['eventType'], detail: string, metadata?: Record<string, unknown>): void {
    this.executionEvents.record({
      eventId: randomUUID(),
      runId,
      eventType,
      detail,
      metadata,
      createdAt: nowIso(),
    });
  }

}
