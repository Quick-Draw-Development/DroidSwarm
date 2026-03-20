import { randomUUID } from 'node:crypto';

import type { PersistenceClient } from './repositories';
import type {
  ArtifactRecord,
  CheckpointRecord,
  CheckpointVectorRecord,
  ExecutionEventRecord,
  OperatorControlActionRecord,
  PersistedTask,
  RunRecord,
  TaskAttemptRecord,
  TaskDependencyRecord,
  VerificationOutcomeRecord,
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

  createTask(task: {
    taskId: string;
    name: string;
    priority: PersistedTask['priority'];
    parentTaskId?: string;
    metadata?: Record<string, unknown>;
    status?: PersistedTask['status'];
  }): PersistedTask {
    const record: PersistedTask = {
      taskId: task.taskId,
      runId: this.run.runId,
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
  ): TaskAttemptRecord {
    const attempt: TaskAttemptRecord = {
      attemptId,
      taskId: task.taskId,
      runId: this.run.runId,
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

  recordExecutionEvent(eventType: ExecutionEventRecord['eventType'], detail: string, metadata?: Record<string, unknown>): void {
    this.persistence.recordExecutionEvent(this.run.runId, eventType, detail, metadata);
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
}
