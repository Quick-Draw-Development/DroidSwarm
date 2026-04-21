import { randomUUID } from 'node:crypto';

import type { PersistenceClient } from './repositories';
import type {
  ArtifactRecord,
  CheckpointRecord,
  CheckpointVectorRecord,
  ExecutionEventRecord,
  HandoffPacket,
  OperatorControlActionRecord,
  PersistedTask,
  ProjectCheckpoint,
  ProjectDecision,
  ProjectFact,
  RunRecord,
  TaskChatMessage,
  TaskAttemptRecord,
  TaskDependencyRecord,
  TaskStateDigest,
  VerificationOutcomeRecord,
  WorkerHeartbeat,
  WorkerResult,
} from '../types';
import { buildEmbedding } from '../utils/embeddings';

const nowIso = (): string => new Date().toISOString();

type TaskAttemptMaintenanceRow = {
  attempt_id: string;
  task_id: string;
  run_id: string;
  agent_name: string;
  status: TaskAttemptRecord['status'];
  metadata_json?: string;
  created_at: string;
  updated_at: string;
};

type CheckpointRow = {
  checkpoint_id: string;
  task_id: string;
  run_id: string;
  attempt_id?: string | null;
  payload_json?: string | null;
  created_at: string;
};

type CheckpointPayload = {
  summary?: string;
  compression?: {
    compressed_content?: string;
  };
  [key: string]: unknown;
};

export class OrchestratorPersistenceService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly run: RunRecord,
  ) {}

  private resolveScope(overrides?: Partial<Pick<RunRecord, 'projectId' | 'repoId' | 'rootPath' | 'branch' | 'workspaceId'>>): Pick<RunRecord, 'projectId' | 'repoId' | 'rootPath' | 'branch' | 'workspaceId'> {
    return {
      projectId: overrides?.projectId ?? this.run.projectId,
      repoId: overrides?.repoId ?? this.run.repoId,
      rootPath: overrides?.rootPath ?? this.run.rootPath,
      branch: overrides?.branch ?? this.run.branch,
      workspaceId: overrides?.workspaceId ?? this.run.workspaceId,
    };
  }

  getRunRecord(): RunRecord {
    return this.run;
  }

  createTask(task: {
    taskId: string;
    name: string;
    priority: PersistedTask['priority'];
    parentTaskId?: string;
    metadata?: Record<string, unknown>;
    status?: PersistedTask['status'];
  }): PersistedTask {
    const scope = this.resolveScope({
      projectId: typeof task.metadata?.project_id === 'string' ? task.metadata.project_id : undefined,
      repoId: typeof task.metadata?.repo_id === 'string' ? task.metadata.repo_id : undefined,
      rootPath: typeof task.metadata?.root_path === 'string' ? task.metadata.root_path : undefined,
      branch: typeof task.metadata?.branch === 'string' ? task.metadata.branch : undefined,
      workspaceId: typeof task.metadata?.workspace_id === 'string' ? task.metadata.workspace_id : undefined,
    });
    const record: PersistedTask = {
      taskId: task.taskId,
      runId: this.run.runId,
      projectId: scope.projectId,
      repoId: scope.repoId,
      rootPath: scope.rootPath,
      branch: scope.branch,
      workspaceId: scope.workspaceId,
      parentTaskId: task.parentTaskId,
      name: task.name,
    status: task.status ?? 'queued',
      priority: task.priority,
      metadata: task.metadata,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.persistence.tasks.create(record);
    return record;
  }

  createAttempt(
    attemptId: string,
    task: PersistedTask,
    agentName: string,
    role: string,
    metadata?: Record<string, unknown>,
    scope?: {
      projectId?: string;
      repoId?: string;
      rootPath?: string;
      branch?: string;
      workspaceId?: string;
    },
  ): TaskAttemptRecord {
    const attempt: TaskAttemptRecord = {
      attemptId,
      taskId: task.taskId,
      runId: this.run.runId,
      projectId: scope?.projectId ?? task.projectId,
      repoId: scope?.repoId ?? task.repoId,
      rootPath: scope?.rootPath ?? task.rootPath,
      branch: scope?.branch ?? task.branch,
      workspaceId: scope?.workspaceId ?? task.workspaceId,
      agentName,
      status: 'running',
      metadata: metadata ? { role, ...metadata } : { role },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.persistence.attempts.create(attempt);
    return attempt;
  }

  setTaskStatus(taskId: string, status: PersistedTask['status']): void {
    const existing = this.persistence.tasks.get(taskId);
    if (!existing) {
      return;
    }

    const updated: PersistedTask = {
      ...existing,
      status,
      updatedAt: nowIso(),
    };
    this.persistence.tasks.create(updated);
  }

  updateTaskPriority(taskId: string, priority: PersistedTask['priority']): void {
    const existing = this.persistence.tasks.get(taskId);
    if (!existing) {
      return;
    }

    const updated: PersistedTask = {
      ...existing,
      priority,
      updatedAt: nowIso(),
    };

    this.persistence.tasks.create(updated);
  }

  getTasks(): PersistedTask[] {
    return this.persistence.tasks.listByRun(this.run.runId);
  }

  getTask(taskId: string): PersistedTask | undefined {
    return this.persistence.tasks.get(taskId) ?? undefined;
  }

  recordAssignment(agentName: string, attemptId: string): void {
    this.persistence.assignments.assign({
      assignmentId: randomUUID(),
      attemptId,
      agentName,
      assignedAt: nowIso(),
    });
  }

  addDependency(taskId: string, dependsOnTaskId: string): void {
    this.persistence.dependencies.add({
      dependencyId: randomUUID(),
      taskId,
      dependsOnTaskId,
      createdAt: nowIso(),
    });
  }

  listDependencies(taskId: string): TaskDependencyRecord[] {
    return this.persistence.dependencies.listDependencies(taskId);
  }

  listDependents(taskId: string): TaskDependencyRecord[] {
    return this.persistence.dependencies.listDependents(taskId);
  }

  updateAttemptStatus(
    attemptId: string,
    status: TaskAttemptRecord['status'],
    metadata?: Record<string, unknown>,
  ): void {
    this.persistence.attempts.updateStatus(attemptId, status, metadata);
  }

  updateAttemptMetadata(attemptId: string, metadata?: Record<string, unknown>): void {
    this.persistence.updateAttemptMetadata(attemptId, metadata);
  }

  listAttemptsForTask(taskId: string): TaskAttemptRecord[] {
    return this.persistence.attempts.listByTask(taskId);
  }

  getAttempt(attemptId: string): TaskAttemptRecord | undefined {
    return this.persistence.attempts.getById(attemptId) ?? undefined;
  }

  recordArtifact(input: {
    artifactId: string;
    attemptId: string;
    taskId: string;
    kind: string;
    summary: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }): void {
    if (!input.attemptId) {
      console.warn('[OrchestratorPersistenceService] skipping artifact without attemptId', input.artifactId);
      return;
    }

    this.persistence.artifacts.create({
      artifactId: input.artifactId,
      attemptId: input.attemptId,
      taskId: input.taskId,
      runId: this.run.runId,
      projectId: this.run.projectId,
      repoId: this.run.repoId,
      rootPath: this.run.rootPath,
      branch: this.run.branch,
      workspaceId: this.run.workspaceId,
      kind: input.kind,
      summary: input.summary,
      content: input.content,
      metadata: input.metadata,
      createdAt: input.createdAt,
    });
  }

  incrementAttemptSideEffectCount(attemptId: string): number {
    const attempt = this.getAttempt(attemptId);
    const existingCount = (attempt?.metadata?.side_effect_count as number | undefined) ?? 0;
    const nextCount = existingCount + 1;
    this.updateAttemptMetadata(attemptId, {
      ...(attempt?.metadata ?? {}),
      side_effect_count: nextCount,
    });
    return nextCount;
  }

  recordCheckpoint(taskId: string, attemptId: string | undefined, payload: CheckpointPayload): string {
    const checkpointId = randomUUID();
    this.persistence.checkpoints.create({
      checkpointId,
      taskId,
      runId: this.run.runId,
      projectId: this.run.projectId,
      repoId: this.run.repoId,
      rootPath: this.run.rootPath,
      branch: this.run.branch,
      workspaceId: this.run.workspaceId,
      attemptId: attemptId ?? undefined,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso(),
    });
    const embeddingContent = [
      typeof payload.summary === 'string' ? payload.summary : '',
      typeof payload.compression?.compressed_content === 'string'
        ? payload.compression.compressed_content
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    this.persistence.vectors.record({
      checkpointId,
      taskId,
      runId: this.run.runId,
      summary: typeof payload.summary === 'string' ? payload.summary : undefined,
      content: typeof payload.compression?.compressed_content === 'string'
        ? payload.compression.compressed_content
        : undefined,
      embedding: buildEmbedding(embeddingContent, 16),
      createdAt: nowIso(),
    });
    return checkpointId;
  }

  getLatestCheckpoint(taskId: string): CheckpointRecord | undefined {
    return this.persistence.checkpoints.getLatestForTask(taskId) ?? undefined;
  }

  getArtifactsForTask(taskId: string): ArtifactRecord[] {
    return this.persistence.artifacts.listByTask(taskId);
  }

  recordVerificationOutcome(params: {
    taskId: string;
    attemptId?: string;
    stage: 'verification' | 'review';
    status: 'passed' | 'failed' | 'blocked';
    summary?: string;
    details?: string;
    reviewer?: string;
  }): void {
    this.persistence.verifications.record({
      reviewId: randomUUID(),
      runId: this.run.runId,
      taskId: params.taskId,
      attemptId: params.attemptId,
      stage: params.stage,
      status: params.status,
      summary: params.summary,
      details: params.details,
      reviewer: params.reviewer,
      createdAt: nowIso(),
    });
  }

  recordBudgetEvent(taskId: string | undefined, detail: string, consumed: number): void {
    this.persistence.budgets.record({
      eventId: randomUUID(),
      runId: this.run.runId,
      projectId: this.run.projectId,
      repoId: this.run.repoId,
      rootPath: this.run.rootPath,
      branch: this.run.branch,
      workspaceId: this.run.workspaceId,
      taskId: taskId ?? null,
      detail,
      consumed,
      createdAt: nowIso(),
    });
  }

  getRunBudgetConsumed(): number {
    return this.persistence.budgets
      .listByRun(this.run.runId)
      .reduce((total, event) => total + event.consumed, 0);
  }

  recordOperatorAction(action: {
    taskId?: string;
    actionType: OperatorControlActionRecord['actionType'];
    detail: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.persistence.actions.record({
      actionId: randomUUID(),
      runId: this.run.runId,
      taskId: action.taskId,
      actionType: action.actionType,
      detail: action.detail,
      metadataJson: action.metadata ? JSON.stringify(action.metadata) : undefined,
      createdAt: nowIso(),
    });
  }

  recordExecutionEvent(
    eventType: ExecutionEventRecord['eventType'],
    detail: string,
    metadata?: Record<string, unknown>,
    options?: {
      taskId?: string;
      normalizedVerb?: ExecutionEventRecord['normalizedVerb'];
      transportBody?: Record<string, unknown>;
    },
  ): void {
    this.persistence.recordExecutionEvent(this.run.runId, eventType, detail, metadata, options);
  }

  updateTaskMetadata(taskId: string, metadata: Record<string, unknown>): void {
    const existing = this.persistence.tasks.get(taskId);
    if (!existing) {
      return;
    }

    const updated: PersistedTask = {
      ...existing,
      metadata,
      updatedAt: nowIso(),
    };
    this.persistence.tasks.create(updated);
  }

  searchCheckpoints(query: string, limit: number): CheckpointVectorRecord[] {
    return this.persistence.vectors.search(query, Math.max(1, limit));
  }

  upsertProject(project: { projectId: string; name: string; description?: string; metadata?: Record<string, unknown> }): void {
    this.persistence.projects.upsert({
      ...project,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  upsertProjectRepo(repo: {
    repoId: string;
    projectId: string;
    name: string;
    rootPath: string;
    defaultBranch: string;
    mainBranch: string;
    developBranch: string;
    allowedRoots: string[];
    metadata?: Record<string, unknown>;
  }): void {
    this.persistence.projectRepos.upsert({
      ...repo,
      id: repo.repoId,
      branch: repo.defaultBranch,
      workspaceId: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  listProjectFacts(projectId: string): ProjectFact[] {
    return this.persistence.memory.listFacts(projectId);
  }

  listProjectDecisions(projectId: string): ProjectDecision[] {
    return this.persistence.memory.listDecisions(projectId);
  }

  listProjectCheckpoints(projectId: string): ProjectCheckpoint[] {
    return this.persistence.memory.listCheckpoints(projectId);
  }

  recordProjectFact(fact: ProjectFact): void {
    this.persistence.memory.recordFact(fact);
  }

  recordProjectDecision(decision: ProjectDecision): void {
    this.persistence.memory.recordDecision(decision);
  }

  recordProjectCheckpoint(checkpoint: ProjectCheckpoint): void {
    this.persistence.memory.recordCheckpoint(checkpoint);
  }

  recordTaskChatMessage(message: TaskChatMessage & { repoId?: string; rootPath?: string; branch?: string; workspaceId?: string }): void {
    this.persistence.chat.create(message);
  }

  listTaskChatMessages(taskId: string): TaskChatMessage[] {
    return this.persistence.chat.listByTask(taskId);
  }

  recordTaskStateDigest(digest: TaskStateDigest): void {
    this.persistence.digests.record(digest);
  }

  getLatestTaskStateDigest(taskId: string): TaskStateDigest | undefined {
    return this.persistence.digests.getLatestForTask(taskId) ?? undefined;
  }

  listTaskStateDigests(taskId: string): TaskStateDigest[] {
    return this.persistence.digests.listByTask(taskId);
  }

  recordHandoffPacket(packet: HandoffPacket): void {
    this.persistence.handoffs.record(packet);
  }

  listHandoffPackets(taskId: string): HandoffPacket[] {
    return this.persistence.handoffs.listByTask(taskId);
  }

  getLatestHandoffPacket(taskId: string, runId?: string): HandoffPacket | undefined {
    return this.persistence.handoffs.getLatest(taskId, runId) ?? undefined;
  }

  recordWorkerResult(taskId: string, attemptId: string, result: WorkerResult): void {
    const task = this.getTask(taskId);
    const scope = this.resolveScope(task ?? undefined);
    if (!scope.repoId || !scope.rootPath || !scope.branch) {
      return;
    }
    this.persistence.workers.recordResult({
      workerResultId: randomUUID(),
      runId: this.run.runId,
      taskId,
      attemptId,
      projectId: scope.projectId,
      repoId: scope.repoId,
      rootPath: scope.rootPath,
      branch: scope.branch,
      workspaceId: scope.workspaceId,
      engine: result.engine,
      model: result.model,
      modelTier: typeof result.metadata?.modelTier === 'string' ? result.metadata.modelTier : undefined,
      queueDepth: typeof result.metadata?.queueDepth === 'number' ? result.metadata.queueDepth : undefined,
      fallbackCount: typeof result.metadata?.fallbackCount === 'number' ? result.metadata.fallbackCount : undefined,
      success: result.success,
      summary: result.summary,
      payloadJson: JSON.stringify(result),
      createdAt: nowIso(),
    });
  }

  recordWorkerHeartbeat(heartbeat: WorkerHeartbeat): void {
    const task = this.getTask(heartbeat.taskId);
    const scope = this.resolveScope(task ?? undefined);
    if (!scope.repoId || !scope.rootPath || !scope.branch) {
      return;
    }
    this.persistence.workers.recordHeartbeat({
      heartbeatId: randomUUID(),
      ...heartbeat,
      projectId: scope.projectId,
      repoId: scope.repoId,
      rootPath: scope.rootPath,
      branch: scope.branch,
      workspaceId: scope.workspaceId,
      modelTier: heartbeat.modelTier,
      queueDepth: heartbeat.queueDepth,
      fallbackCount: heartbeat.fallbackCount,
    });
  }

  listWorkerHeartbeats(attemptId: string): WorkerHeartbeat[] {
    return this.persistence.workers.listHeartbeatsByAttempt(attemptId);
  }
}
