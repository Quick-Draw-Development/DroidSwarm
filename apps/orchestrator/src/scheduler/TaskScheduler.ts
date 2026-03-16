import { randomUUID } from 'node:crypto';

import { AgentSupervisor, defaultRoleInstructions } from '../AgentSupervisor';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type {
  CodexAgentResult,
  OrchestratorConfig,
  PersistedTask,
  RequestedAgent,
  TaskRecord,
} from '../types';

const buildTaskRecord = (task: PersistedTask): TaskRecord => ({
  taskId: task.taskId,
  title: task.name,
  description: typeof task.metadata?.description === 'string' ? task.metadata.description : '',
  taskType: typeof task.metadata?.task_type === 'string' ? task.metadata.task_type : 'task',
  priority: task.priority,
  createdAt: task.createdAt,
  createdByUserId: typeof task.metadata?.created_by === 'string' ? task.metadata.created_by : undefined,
  branchName: typeof task.metadata?.branch_name === 'string' ? task.metadata.branch_name : undefined,
});

const dependencySatisfiedStatuses: PersistedTask['status'][] = ['completed', 'verified', 'failed', 'cancelled'];

export class TaskScheduler {
  private readonly readyQueue = new Set<string>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly persistenceService: OrchestratorPersistenceService,
    private readonly supervisor: AgentSupervisor,
    private readonly config: OrchestratorConfig,
  ) {}

  handleNewTask(taskId: string): void {
    this.readyQueue.add(taskId);
    this.schedule();
  }

  handleAgentResult(
    taskId: string,
    attemptId: string,
    agentName: string,
    role: string,
    result: CodexAgentResult,
  ): void {
    const task = this.persistenceService.getTask(taskId);
    if (!task) {
      return;
    }

    this.clearRetry(task.taskId);

    const attemptStatus = result.status === 'completed' ? 'completed' : 'failed';
    this.persistenceService.updateAttemptStatus(attemptId, attemptStatus, {
      reason_code: result.reason_code,
      summary: result.summary,
    });

    const limitedRequests = result.requested_agents.slice(0, this.config.schedulerMaxFanOut);
    if (limitedRequests.length > 0) {
      this.persistenceService.setTaskStatus(taskId, 'waiting_on_dependency');
      this.createChildTasks(task, limitedRequests, result.summary, result.compression?.compressed_content);
      if (limitedRequests.length < result.requested_agents.length) {
        this.log(
          `truncated ${result.requested_agents.length - limitedRequests.length} requested agents for ${taskId}`,
        );
      }
    } else if (result.status === 'completed') {
      this.persistenceService.setTaskStatus(taskId, 'completed');
    } else {
      this.persistenceService.setTaskStatus(taskId, 'waiting_on_human');
      this.scheduleRetry(task.taskId);
    }

    this.resolveParentIfReady(task);
    this.schedule();
  }

  private schedule(): void {
    const pending = Array.from(this.readyQueue);
    if (pending.length === 0) {
      return;
    }

    for (const taskId of pending) {
      const task = this.persistenceService.getTask(taskId);
      if (!task) {
        this.readyQueue.delete(taskId);
        continue;
      }

      if (!this.canRun(task)) {
        continue;
      }

      this.readyQueue.delete(taskId);
      this.launch(task);
    }
  }

  private canRun(task: PersistedTask): boolean {
    if (task.status === 'running' || task.status === 'cancelled') {
      return false;
    }

    if (this.supervisor.getActiveAgentCount() >= this.config.maxConcurrentAgents) {
      return false;
    }

    if (this.getTaskDepth(task.taskId) >= this.config.schedulerMaxTaskDepth) {
      this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_human');
      return false;
    }

    if (!['queued', 'planning', 'waiting_on_dependency'].includes(task.status)) {
      return false;
    }

    const dependencies = this.persistenceService.listDependencies(task.taskId);
    if (dependencies.length === 0) {
      if (task.status === 'planning') {
        this.persistenceService.setTaskStatus(task.taskId, 'queued');
      }
      return task.status === 'queued' || task.status === 'planning';
    }

    if (!this.areDependenciesSatisfied(dependencies)) {
      if (task.status !== 'waiting_on_dependency') {
        this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_dependency');
      }
      return false;
    }

    if (task.status !== 'queued') {
      this.persistenceService.setTaskStatus(task.taskId, 'queued');
    }
    return true;
  }

  private areDependenciesSatisfied(dependencies: { dependsOnTaskId: string }[]): boolean {
    for (const dependency of dependencies) {
      const candidate = this.persistenceService.getTask(dependency.dependsOnTaskId);
      if (!candidate || !dependencySatisfiedStatuses.includes(candidate.status)) {
        return false;
      }
    }

    return true;
  }

  private launch(task: PersistedTask): void {
    const record = buildTaskRecord(task);
    const metadata = task.metadata ?? {};
    const defaultAssignment = defaultRoleInstructions(record)[0];
    const role = typeof metadata.agent_role === 'string' ? metadata.agent_role : defaultAssignment.role;
    const instructions = typeof metadata.agent_instructions === 'string'
      ? metadata.agent_instructions
      : defaultAssignment.instructions;
    const parentSummary = typeof metadata.parent_summary === 'string' ? metadata.parent_summary : undefined;
    const parentDroidspeak = typeof metadata.parent_droidspeak === 'string'
      ? metadata.parent_droidspeak
      : undefined;

    const attemptId = randomUUID();
    const spawned = this.supervisor.startAgentForTask(record, role, attemptId, parentSummary, parentDroidspeak);
    if (!spawned) {
      this.readyQueue.add(task.taskId);
      return;
    }

    this.persistenceService.createAttempt(
      attemptId,
      task,
      spawned.agentName,
      role,
      {
        instructions,
        parent_summary: parentSummary,
        parent_droidspeak: parentDroidspeak,
      },
    );
    this.persistenceService.recordAssignment(spawned.agentName, attemptId);
    this.persistenceService.setTaskStatus(task.taskId, 'running');
  }

  private createChildTasks(
    task: PersistedTask,
    requests: RequestedAgent[],
    parentSummary: string,
    parentDroidspeak?: string,
  ): void {
    const taskDepth = this.getTaskDepth(task.taskId);
    if (taskDepth + 1 > this.config.schedulerMaxTaskDepth) {
      this.log(`max depth ${this.config.schedulerMaxTaskDepth} reached for ${task.taskId}; waiting on human`);
      this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_human');
      this.scheduleRetry(task.taskId);
      return;
    }

    for (const request of requests) {
      const childId = randomUUID();
      this.persistenceService.createTask({
        taskId: childId,
        name: `${task.name} → ${request.role}`,
        priority: task.priority,
        parentTaskId: task.taskId,
        status: 'queued',
        metadata: {
          description: request.instructions,
          task_type: request.role,
          agent_role: request.role,
          agent_instructions: request.instructions,
          agent_reason: request.reason,
          parent_summary: parentSummary,
          parent_droidspeak: parentDroidspeak,
        },
      });
      this.persistenceService.addDependency(task.taskId, childId);
      this.readyQueue.add(childId);
    }
  }

  private resolveParentIfReady(task: PersistedTask): void {
    if (!task.parentTaskId) {
      return;
    }

    const parent = this.persistenceService.getTask(task.parentTaskId);
    if (!parent || parent.status !== 'waiting_on_dependency') {
      return;
    }

    const dependencies = this.persistenceService.listDependencies(parent.taskId);
    const incomplete = dependencies.some((dependency) => {
      const child = this.persistenceService.getTask(dependency.dependsOnTaskId);
      return !child || !dependencySatisfiedStatuses.includes(child.status);
    });

    if (!incomplete) {
      this.persistenceService.setTaskStatus(parent.taskId, 'completed');
    }
  }

  private log(message: string): void {
    console.log('[TaskScheduler]', message);
  }

  private getTaskDepth(taskId: string): number {
    let depth = 0;
    let current = this.persistenceService.getTask(taskId);
    while (current?.parentTaskId) {
      depth += 1;
      current = this.persistenceService.getTask(current.parentTaskId);
    }
    return depth;
  }

  private scheduleRetry(taskId: string): void {
    if (this.retryTimers.has(taskId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.retryTimers.delete(taskId);
      this.readyQueue.add(taskId);
      this.schedule();
    }, this.config.schedulerRetryIntervalMs);
    this.retryTimers.set(taskId, timer);
  }

  private clearRetry(taskId: string): void {
    const timer = this.retryTimers.get(taskId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.retryTimers.delete(taskId);
  }
}
