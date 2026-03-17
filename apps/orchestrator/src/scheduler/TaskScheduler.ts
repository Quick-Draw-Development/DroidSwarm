import { randomUUID } from 'node:crypto';

import { AgentSupervisor, defaultRoleInstructions } from '../AgentSupervisor';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type {
  CheckpointRecord,
  CodexAgentResult,
  OrchestratorConfig,
  PersistedTask,
  RequestedAgent,
  TaskPolicy,
  TaskRecord,
  TaskDependencyRecord,
  VerificationOutcomeRecord,
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

const dependencySuccessStatuses: PersistedTask['status'][] = ['completed', 'verified'];
const dependencyFailureStatuses: PersistedTask['status'][] = ['failed', 'cancelled'];

type CheckpointPayload = {
  summary?: string;
  compression?: {
    compressed_content?: string;
  };
};

export interface TaskSchedulerEvents {
  onPlanProposed?: (
    taskId: string,
    planId: string,
    summary: string,
    plan?: string,
    dependencies?: string[],
  ) => void;
  onCheckpointCreated?: (
    taskId: string,
    checkpointId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ) => void;
  onVerificationRequested?: (
    taskId: string,
    verificationType: string,
    requestedBy: string,
    detail?: string,
  ) => void;
  onVerificationOutcome?: (
    taskId: string,
    stage: 'verification' | 'review',
    status: 'passed' | 'failed' | 'blocked',
    summary?: string,
    attemptId?: string,
    reviewer?: string,
  ) => void;
}

export class TaskScheduler {
  private readonly readyQueue = new Set<string>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private events?: TaskSchedulerEvents;

  constructor(
    private readonly persistenceService: OrchestratorPersistenceService,
    private readonly supervisor: AgentSupervisor,
    private readonly config: OrchestratorConfig,
  ) {}

  setEvents(events: TaskSchedulerEvents): void {
    this.events = events;
  }

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
    if (!this.applyUsageConstraints(task, attemptId, result)) {
      this.schedule();
      return;
    }

    const attemptStatus = result.status === 'completed' ? 'completed' : 'failed';
    this.persistenceService.updateAttemptStatus(attemptId, attemptStatus, {
      reason_code: result.reason_code,
      summary: result.summary,
    });

    const stage = typeof task.metadata?.stage === 'string' ? task.metadata.stage : undefined;
    if (stage === 'verification') {
      this.handleVerificationResult(task, attemptId, agentName, result);
      return;
    }

    if (stage === 'review') {
      this.handleReviewResult(task, attemptId, agentName, result);
      return;
    }

    const limitedRequests = result.requested_agents.slice(0, this.config.schedulerMaxFanOut);
    if (limitedRequests.length > 0) {
      const created = this.createChildTasks(
        task,
        limitedRequests,
        result.summary,
        result.compression?.compressed_content,
      );
      if (created) {
        this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_dependency');
      }
      if (limitedRequests.length < result.requested_agents.length) {
        this.log(
          `truncated ${result.requested_agents.length - limitedRequests.length} requested agents for ${taskId}`,
        );
      }
    } else if (result.status === 'completed') {
      this.persistenceService.setTaskStatus(taskId, 'in_review');
      this.startVerification(task, result.summary);
    } else {
      this.persistenceService.setTaskStatus(taskId, 'waiting_on_human');
      this.scheduleRetry(task.taskId);
    }

    if (result.compression?.compressed_content) {
      const checkpointId = this.persistenceService.recordCheckpoint(
        taskId,
        attemptId,
        {
          compression: result.compression,
          summary: result.summary,
        },
      );
      this.events?.onCheckpointCreated?.(
        taskId,
        checkpointId,
        result.summary,
        {
          compression: result.compression,
        },
      );
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

    const globalActive = this.supervisor.getActiveAgentCount();
    const codeCount = this.supervisor.countActiveAgents((agent) => this.isCodeRole(agent.role));
    if (this.config.maxConcurrentCodeAgents > 0 && codeCount >= this.config.maxConcurrentCodeAgents) {
      this.recordBudgetLimit(
        task.taskId,
        `Concurrent code agent limit (${this.config.maxConcurrentCodeAgents}) reached`,
        codeCount,
      );
      return false;
    }

    if (globalActive >= this.config.maxConcurrentAgents) {
      this.recordBudgetLimit(
        task.taskId,
        `Global concurrent agent limit (${this.config.maxConcurrentAgents}) reached`,
        globalActive,
      );
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

    const evaluation = this.evaluateDependencies(task, dependencies);
    if (evaluation.blockingDependency) {
      this.handleDependencyFailure(task, evaluation.blockingDependency);
      return false;
    }

    if (!evaluation.satisfied) {
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

  private evaluateDependencies(task: PersistedTask, dependencies: TaskDependencyRecord[]): { satisfied: boolean; blockingDependency?: PersistedTask } {
    for (const dependency of dependencies) {
      const candidate = this.persistenceService.getTask(dependency.dependsOnTaskId);
      if (!candidate) {
        return { satisfied: false };
      }

      if (dependencySuccessStatuses.includes(candidate.status)) {
        continue;
      }

      if (dependencyFailureStatuses.includes(candidate.status)) {
        return { satisfied: false, blockingDependency: candidate };
      }

      return { satisfied: false };
    }

    return { satisfied: true };
  }

  private handleDependencyFailure(task: PersistedTask, dependency: PersistedTask): void {
    const reason = `Dependency ${dependency.taskId} ${dependency.status}`;
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...(task.metadata ?? {}),
      blocked_reason: reason,
    });
    this.persistenceService.setTaskStatus(task.taskId, 'failed');
    this.recordBudgetLimit(task.taskId, reason, 0);
  }

  private launch(task: PersistedTask): void {
    const record = buildTaskRecord(task);
    const metadata = task.metadata ?? {};
    const checkpoint = this.persistenceService.getLatestCheckpoint(task.taskId);
    const checkpointPayload = checkpoint ? this.parseCheckpointPayload(checkpoint) : undefined;

    const defaultAssignment = defaultRoleInstructions(record)[0];
    const role = typeof metadata.agent_role === 'string' ? metadata.agent_role : defaultAssignment.role;
    const instructions = typeof metadata.agent_instructions === 'string'
      ? metadata.agent_instructions
      : defaultAssignment.instructions;
    const metadataParentSummary = typeof metadata.parent_summary === 'string' ? metadata.parent_summary : undefined;
    const metadataParentDroidspeak = typeof metadata.parent_droidspeak === 'string'
      ? metadata.parent_droidspeak
      : undefined;
    const parentSummary = checkpointPayload?.summary ?? metadataParentSummary;
    const parentDroidspeak = checkpointPayload?.compression?.compressed_content ?? metadataParentDroidspeak;

    if (!this.checkSideEffectBudget(task)) {
      this.readyQueue.add(task.taskId);
      return;
    }

    const attemptId = randomUUID();
    const spawned = this.supervisor.startAgentForTask(record, role, attemptId, parentSummary, parentDroidspeak);
    if (!spawned) {
      this.readyQueue.add(task.taskId);
      return;
    }

    const effectivePolicy = this.resolveTaskPolicy(task);
    this.persistenceService.createAttempt(
      attemptId,
      task,
      spawned.agentName,
      role,
      {
        instructions,
        parent_summary: parentSummary,
        parent_droidspeak: parentDroidspeak,
        effective_policy: effectivePolicy,
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
  ): boolean {
    const taskDepth = this.getTaskDepth(task.taskId);
    const childIds: string[] = [];
    if (taskDepth + 1 > this.config.schedulerMaxTaskDepth) {
      this.log(`max depth ${this.config.schedulerMaxTaskDepth} reached for ${task.taskId}; waiting on human`);
      this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_human');
      this.scheduleRetry(task.taskId);
      return false;
    }

    if (!this.enforceTaskPolicy(task, requests)) {
      return false;
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
      childIds.push(childId);
    }
    const planSummary = requests.map((request) => `${request.role}: ${request.reason}`).join(' | ') || task.name;
    if (childIds.length > 0) {
      this.events?.onPlanProposed?.(
        task.taskId,
        randomUUID(),
        planSummary,
        parentSummary,
        childIds,
      );
    }
    return childIds.length > 0;
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
    const evaluation = this.evaluateDependencies(parent, dependencies);
    if (evaluation.blockingDependency) {
      this.handleDependencyFailure(parent, evaluation.blockingDependency);
      return;
    }
    if (!evaluation.satisfied) {
      return;
    }

    this.persistenceService.setTaskStatus(parent.taskId, 'completed');
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

  private handleVerificationResult(
    task: PersistedTask,
    attemptId: string,
    agentName: string,
    result: CodexAgentResult,
  ): void {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }

    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }

    const normalizedStatus = this.mapResultToOutcomeStatus(result.status);
    this.persistenceService.recordVerificationOutcome({
      taskId: parent.taskId,
      attemptId,
      stage: 'verification',
      status: normalizedStatus,
      summary: result.summary,
      details: this.buildOutcomeDetails(result),
      reviewer: agentName,
    });
    this.events?.onVerificationOutcome?.(
      parent.taskId,
      'verification',
      normalizedStatus,
      result.summary,
      attemptId,
      agentName,
    );

    if (result.status === 'completed') {
      this.persistenceService.setTaskStatus(task.taskId, 'completed');
      this.persistenceService.setTaskStatus(parent.taskId, 'verified');
      this.startReview(parent, result.summary);
    } else {
      this.persistenceService.setTaskStatus(task.taskId, 'failed');
      this.persistenceService.setTaskStatus(parent.taskId, 'waiting_on_human');
      this.scheduleRetry(task.taskId);
    }

    this.resolveParentIfReady(task);
  }

  private handleReviewResult(
    task: PersistedTask,
    attemptId: string,
    agentName: string,
    result: CodexAgentResult,
  ): void {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }

    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }

    const normalizedStatus = this.mapResultToOutcomeStatus(result.status);
    this.persistenceService.recordVerificationOutcome({
      taskId: parent.taskId,
      attemptId,
      stage: 'review',
      status: normalizedStatus,
      summary: result.summary,
      details: this.buildOutcomeDetails(result),
      reviewer: agentName,
    });
    this.events?.onVerificationOutcome?.(
      parent.taskId,
      'review',
      normalizedStatus,
      result.summary,
      attemptId,
      agentName,
    );

    if (result.status === 'completed') {
      this.persistenceService.setTaskStatus(task.taskId, 'completed');
      this.persistenceService.setTaskStatus(parent.taskId, 'verified');
    } else {
      this.persistenceService.setTaskStatus(task.taskId, 'failed');
      this.persistenceService.setTaskStatus(parent.taskId, 'waiting_on_human');
      this.scheduleRetry(task.taskId);
    }

    this.resolveParentIfReady(task);
  }

  private startVerification(parent: PersistedTask, summary: string | undefined): void {
    if (this.hasStageDependency(parent, 'verification')) {
      return;
    }

    const child = this.createStageTask(parent, 'verification', 'tester', 'Verification pass for implementation', summary);
    this.readyQueue.add(child.taskId);
    this.persistenceService.setTaskStatus(parent.taskId, 'in_review');
    this.events?.onVerificationRequested?.(
      parent.taskId,
      'verification',
      this.config.agentName,
      summary,
    );
  }

  private startReview(parent: PersistedTask, summary: string | undefined): void {
    if (this.hasStageDependency(parent, 'review')) {
      return;
    }

    const child = this.createStageTask(parent, 'review', 'reviewer', 'Human review pass', summary);
    this.readyQueue.add(child.taskId);
    this.persistenceService.setTaskStatus(parent.taskId, 'waiting_on_dependency');
  }

  private createStageTask(
    parent: PersistedTask,
    stage: 'verification' | 'review',
    role: string,
    description: string,
    parentSummary?: string,
  ): PersistedTask {
    const taskId = randomUUID();
    const record = this.persistenceService.createTask({
      taskId,
      name: `${parent.name} → ${stage}`,
      priority: parent.priority,
      parentTaskId: parent.taskId,
      status: 'queued',
      metadata: {
        stage,
        agent_role: role,
        task_type: stage,
        description,
        parent_summary: parentSummary,
      },
    });
    this.persistenceService.addDependency(parent.taskId, record.taskId);
    return record;
  }

  private hasStageDependency(parent: PersistedTask, stage: string): boolean {
    const dependents = this.persistenceService.listDependents(parent.taskId);
    for (const dependency of dependents) {
      const child = this.persistenceService.getTask(dependency.dependsOnTaskId);
      if (child?.metadata?.stage === stage) {
        return true;
      }
    }
    return false;
  }


  private parseCheckpointPayload(checkpoint: CheckpointRecord): CheckpointPayload | undefined {
    try {
      return JSON.parse(checkpoint.payloadJson) as CheckpointPayload;
    } catch {
      return undefined;
    }
  }

  private isCodeRole(role: string): boolean {
    const normalized = role.toLowerCase();
    return normalized.includes('code') || normalized.includes('coder') || normalized.includes('dev');
  }

  private recordBudgetLimit(taskId: string | undefined, detail: string, consumed: number): void {
    this.persistenceService.recordBudgetEvent(taskId, detail, consumed);
  }

  private checkSideEffectBudget(task: PersistedTask): boolean {
    if (this.config.sideEffectActionsBeforeReview <= 0) {
      return true;
    }

    const sideEffectArtifacts = this.persistenceService
      .getArtifactsForTask(task.taskId)
      .filter((artifact) => artifact.kind === 'side_effect').length;
    if (sideEffectArtifacts >= this.config.sideEffectActionsBeforeReview) {
      this.recordBudgetLimit(
        task.taskId,
        `Side-effect action limit (${this.config.sideEffectActionsBeforeReview}) reached`,
        sideEffectArtifacts,
      );
      this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_human');
      return false;
    }

    return true;
  }

  private getTaskPolicy(task: PersistedTask): TaskPolicy {
    const rawPolicy = task.metadata?.policy;
    if (!rawPolicy || typeof rawPolicy !== 'object') {
      return {};
    }

    const policyRecord = rawPolicy as Record<string, unknown>;
    return {
      maxDepth: this.toPositiveNumber(policyRecord.max_depth ?? policyRecord.maxDepth),
      maxChildren: this.toPositiveNumber(policyRecord.max_children ?? policyRecord.maxChildren),
      maxTokens: this.toPositiveNumber(policyRecord.max_tokens ?? policyRecord.maxTokens),
      maxToolCalls: this.toPositiveNumber(policyRecord.max_tool_calls ?? policyRecord.maxToolCalls),
      timeoutMs: this.toPositiveNumber(policyRecord.timeout_ms ?? policyRecord.timeoutMs),
      allowedTools: Array.isArray(policyRecord.allowed_tools)
        ? policyRecord.allowed_tools.filter((value: unknown): value is string => typeof value === 'string')
        : undefined,
      approvalPolicy: typeof policyRecord.approval_policy === 'string' &&
        ['auto', 'manual'].includes(policyRecord.approval_policy)
        ? (policyRecord.approval_policy as TaskPolicy['approvalPolicy'])
        : undefined,
    };
  }

  private resolveTaskPolicy(task: PersistedTask): TaskPolicy {
    const overrides = this.getTaskPolicy(task);
    const defaults = this.config.policyDefaults ?? {};
    const allowedTools = overrides.allowedTools ?? defaults.allowedTools;
    return {
      maxDepth: overrides.maxDepth ?? defaults.maxDepth,
      maxChildren: overrides.maxChildren ?? defaults.maxChildren,
      maxTokens: overrides.maxTokens ?? defaults.maxTokens,
      maxToolCalls: overrides.maxToolCalls ?? defaults.maxToolCalls,
      timeoutMs: overrides.timeoutMs ?? defaults.timeoutMs,
      allowedTools: allowedTools ? [...allowedTools] : undefined,
      approvalPolicy: overrides.approvalPolicy ?? defaults.approvalPolicy,
    };
  }

  private toPositiveNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return undefined;
  }

  private getPolicyChildCount(task: PersistedTask): number {
    return this.persistenceService.listDependents(task.taskId).length;
  }

  private enforceTaskPolicy(task: PersistedTask, requests: RequestedAgent[]): boolean {
    const policy = this.resolveTaskPolicy(task);

    if (policy.maxDepth != null) {
      const depth = this.getTaskDepth(task.taskId);
      if (depth >= policy.maxDepth) {
        this.recordPolicyViolation(
          task,
          `Task depth ${depth} meets policy max depth ${policy.maxDepth}`,
          depth,
        );
        return false;
      }
    }

    const childCount = this.getPolicyChildCount(task);
    if (policy.maxChildren != null && childCount + requests.length > policy.maxChildren) {
      this.recordPolicyViolation(
        task,
        `Policy max children ${policy.maxChildren} exceeded (${childCount} existing + ${requests.length} new)`,
        childCount + requests.length,
      );
      return false;
    }

    if (policy.approvalPolicy === 'manual' && requests.length > 0) {
      this.recordPolicyViolation(
        task,
        'Manual approval policy requires human review before spawning assistants',
        requests.length,
      );
      return false;
    }

    return true;
  }

  private applyUsageConstraints(task: PersistedTask, attemptId: string, result: CodexAgentResult): boolean {
    const policy = this.resolveTaskPolicy(task);
    const metrics = result.metrics;
    const existingUsage = (task.metadata?.usage ?? {}) as Record<string, number | undefined>;
    let tokensTotal = existingUsage.tokens ?? 0;
    let toolCallsTotal = existingUsage.tool_calls ?? 0;

    if (metrics?.tokens != null) {
      tokensTotal += metrics.tokens;
    }
    if (metrics?.tool_calls != null) {
      toolCallsTotal += metrics.tool_calls;
    }

    const shouldPersistUsage = Boolean(metrics?.tokens != null || metrics?.tool_calls != null);
    const usageUpdates: Record<string, unknown> = {};
    if (shouldPersistUsage) {
      usageUpdates.usage = {
        ...existingUsage,
        tokens: tokensTotal,
        tool_calls: toolCallsTotal,
      };
    }

    const persistUsage = (): void => {
      if (!shouldPersistUsage) {
        return;
      }

      this.persistenceService.updateTaskMetadata(task.taskId, {
        ...(task.metadata ?? {}),
        ...usageUpdates,
      });
    };

    if (policy.maxTokens != null && tokensTotal > policy.maxTokens) {
      persistUsage();
      this.recordPolicyViolation(
        task,
        `Policy max tokens ${policy.maxTokens} exceeded (${tokensTotal})`,
        tokensTotal,
      );
      return false;
    }

    if (policy.maxToolCalls != null && toolCallsTotal > policy.maxToolCalls) {
      persistUsage();
      this.recordPolicyViolation(
        task,
        `Policy max tool calls ${policy.maxToolCalls} exceeded (${toolCallsTotal})`,
        toolCallsTotal,
      );
      return false;
    }

    if (policy.allowedTools && policy.allowedTools.length > 0 && Array.isArray(metrics?.tools)) {
      const disallowed = metrics.tools.filter((tool) => !policy.allowedTools!.includes(tool));
      if (disallowed.length > 0) {
        persistUsage();
        this.recordPolicyViolation(
          task,
          `Tool usage forbidden by policy (${disallowed.join(', ')})`,
          disallowed.length,
        );
        return false;
      }
    }

    if (policy.timeoutMs != null) {
      const attempt = this.persistenceService.getAttempt(attemptId);
      if (attempt) {
        const elapsedMs = Date.now() - new Date(attempt.createdAt).getTime();
        if (elapsedMs > policy.timeoutMs) {
          persistUsage();
          this.recordPolicyViolation(
            task,
            `Task exceeded timeout ${policy.timeoutMs}ms (${Math.round(elapsedMs)}ms)`,
            elapsedMs,
          );
          return false;
        }
      }
    }

    if (shouldPersistUsage) {
      persistUsage();
    }

    return true;
  }

  private mapResultToOutcomeStatus(status: CodexAgentResult['status']): VerificationOutcomeRecord['status'] {
    if (status === 'completed') {
      return 'passed';
    }
    if (status === 'blocked') {
      return 'blocked';
    }
    return 'failed';
  }

  private buildOutcomeDetails(result: CodexAgentResult): string | undefined {
    const fragments: string[] = [];
    if (result.reason_code) {
      fragments.push(result.reason_code);
    }
    if (result.clarification_question) {
      fragments.push(`clarification: ${result.clarification_question}`);
    }
    return fragments.length > 0 ? fragments.join(' | ') : undefined;
  }

  private recordPolicyViolation(task: PersistedTask, detail: string, consumed: number): void {
    this.recordBudgetLimit(task.taskId, detail, consumed);
    this.persistenceService.setTaskStatus(task.taskId, 'waiting_on_human');
  }

}
