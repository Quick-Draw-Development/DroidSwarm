import type { TaskRecord, TaskState } from './types';

export class TaskRegistry {
  private readonly tasks = new Map<string, TaskState>();

  register(task: TaskRecord): TaskState {
    const existing = this.tasks.get(task.taskId);
    if (existing) {
      existing.task = task;
      existing.updatedAt = task.createdAt;
      return existing;
    }

    const state: TaskState = {
      task,
      status: 'pending',
      activeAgents: [],
      updatedAt: task.createdAt,
    };
    this.tasks.set(task.taskId, state);
    return state;
  }

  assignAgents(taskId: string, agentNames: string[]): TaskState {
    const state = this.get(taskId);
    if (!state) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    state.activeAgents = [...new Set(agentNames)];
    state.updatedAt = new Date().toISOString();
    return state;
  }

  cancel(taskId: string, updatedAt: string): string[] {
    const task = this.get(taskId);
    if (!task) {
      return [];
    }
    const removedAgents = [...task.activeAgents];
    task.status = 'cancelled';
    task.activeAgents = [];
    task.updatedAt = updatedAt;
    return removedAgents;
  }

  get(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId);
  }

  removeAgent(taskId: string, agentName: string): void {
    const task = this.get(taskId);
    if (!task) {
      return;
    }

    task.activeAgents = task.activeAgents.filter((candidate) => candidate !== agentName);
    task.updatedAt = new Date().toISOString();
  }
}
