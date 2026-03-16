import { randomUUID } from 'node:crypto';

import type { PersistenceClient } from './repositories';
import type { PersistedTask, RunRecord } from '../types';

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
  }): PersistedTask {
    const record: PersistedTask = {
      taskId: task.taskId,
      runId: this.run.runId,
      parentTaskId: task.parentTaskId,
      name: task.name,
      status: 'planning',
      priority: task.priority,
      metadata: task.metadata,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.persistence.tasks.create(record);
    return record;
  }

  setTaskStatus(taskId: string, status: PersistedTask['status']): void {
    const tasks = this.persistence.tasks.listByRun(this.run.runId);
    const existing = tasks.find((task) => task.taskId === taskId);
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
    return this.getTasks().find((task) => task.taskId === taskId);
  }

  recordAssignment(agentName: string, attemptId?: string): void {
    this.persistence.assignments.assign({
      assignmentId: randomUUID(),
      attemptId: attemptId ?? randomUUID(),
      agentName,
      assignedAt: nowIso(),
    });
  }
}
