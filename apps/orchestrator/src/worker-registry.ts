import type { TaskRecord, WorkerState } from './types';

export class WorkerRegistry {
  private readonly tasks = new Map<string, WorkerState>();

  register(task: TaskRecord): WorkerState {
    const existing = this.tasks.get(task.taskId);
    const now = new Date().toISOString();
    if (existing) {
      existing.task = task;
      existing.lastUpdated = now;
      return existing;
    }

    const state: WorkerState = {
      task,
      activeAgents: [],
      lastUpdated: now,
    };
    this.tasks.set(task.taskId, state);
    return state;
  }

  assignAgents(taskId: string, agentNames: string[]): WorkerState {
    const state = this.ensureState(taskId);
    state.activeAgents = [...new Set(agentNames)];
    state.lastUpdated = new Date().toISOString();
    return state;
  }

  clearAgents(taskId: string): string[] {
    const state = this.tasks.get(taskId);
    if (!state) {
      return [];
    }
    const removed = [...state.activeAgents];
    state.activeAgents = [];
    state.lastUpdated = new Date().toISOString();
    return removed;
  }

  get(taskId: string): WorkerState | undefined {
    return this.tasks.get(taskId);
  }

  getState(taskId: string): WorkerState {
    return this.ensureState(taskId);
  }

  getActiveAgents(taskId: string): string[] {
    return [...(this.tasks.get(taskId)?.activeAgents ?? [])];
  }

  removeAgent(taskId: string, agentName: string): void {
    const state = this.tasks.get(taskId);
    if (!state) {
      return;
    }
    state.activeAgents = state.activeAgents.filter((candidate) => candidate !== agentName);
    state.lastUpdated = new Date().toISOString();
  }

  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  private ensureState(taskId: string): WorkerState {
    const state = this.tasks.get(taskId);
    if (!state) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    return state;
  }
}
