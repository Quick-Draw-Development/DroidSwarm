import { randomUUID } from 'node:crypto';

import type { PersistenceClient } from './repositories';
import type { PersistedTask, RunRecord, TaskAttemptRecord, TaskDependencyRecord } from '../types';

const nowIso = (): string => new Date().toISOString();

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

  listAttemptsForTask(taskId: string): TaskAttemptRecord[] {
    return this.persistence.database
      .prepare('SELECT * FROM task_attempts WHERE task_id = ?')
      .all(taskId)
      .map((row: TaskAttemptRecord & { metadata_json?: string }) => ({
        attemptId: row.attempt_id,
        taskId: row.task_id,
        runId: row.run_id,
        agentName: row.agent_name,
        status: row.status as TaskAttemptRecord['status'],
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }
}
