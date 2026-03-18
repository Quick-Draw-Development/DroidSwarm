import { randomUUID } from 'node:crypto';

import {
  buildCheckpointCreatedMessage,
  buildOperatorChatResponse,
  buildOrchestratorStatusUpdate,
  buildPlanProposedMessage,
  buildTaskAssignedMessage,
  buildVerificationCompletedMessage,
  buildVerificationRequestedMessage,
} from '../messages';
import { buildTaskIntakeAccepted } from '../protocol';
import { isCancellationMessage, resolveTaskFromMessage } from '../task-events';
import type {
  CodexAgentResult,
  ExecutionEventRecord,
  MessageEnvelope,
  OrchestratorConfig,
  PersistedTask,
  SpawnedAgent,
} from '../types';
import { buildReviewAnnouncement } from '../operator-notifications';
import { WorkerRegistry } from '../worker-registry';
import type { OrchestratorPersistenceService } from '../persistence/service';
import { SocketGateway, MessageSource } from '../socket/SocketGateway';
import { TaskScheduler } from '../scheduler/TaskScheduler';
import { AgentSupervisor } from '../AgentSupervisor';
import { OperatorActionService } from '../operator/OperatorActionService';
import { OperatorChatResponder } from '../operator/OperatorChatResponder';
import { OperatorControlAction, parseOperatorIntent } from '../operator/operator-intents';
import { RunLifecycleService } from '../run-lifecycle';
import type { TaskSchedulerEvents } from '../scheduler/TaskScheduler';

export interface OrchestratorEngineOptions {
  config: OrchestratorConfig;
  persistenceService: OrchestratorPersistenceService;
  scheduler: TaskScheduler;
  supervisor: AgentSupervisor;
  gateway: SocketGateway;
  chatResponder: OperatorChatResponder;
  controlService: OperatorActionService;
  registry: WorkerRegistry;
  runLifecycle: RunLifecycleService;
}

export class OrchestratorEngine implements TaskSchedulerEvents {
  private readonly prefix = '[OrchestratorEngine]';
  private readonly agentAttemptMap = new Map<string, string>();

  constructor(
    private readonly options: OrchestratorEngineOptions,
  ) {}

  async handleMessage(message: MessageEnvelope, source: MessageSource): Promise<void> {
    if (message.project_id !== this.options.config.projectId) {
      return;
    }

    if (message.from.actor_name === this.options.config.agentName) {
      return;
    }

    const isTaskChannel = source === 'task';

    if (isTaskChannel && message.type === 'artifact_created') {
      this.persistArtifact(message as MessageEnvelope<'artifact_created'>);
      return;
    }

    if (isTaskChannel && message.type === 'spawn_requested') {
    const payload = message.payload as unknown as Record<string, unknown>;
      this.recordChannelEvent(
        'spawn_requested',
        `Spawn requested for ${payload.needed_role ?? 'agent'}`,
        message,
        {
          role: payload.needed_role,
          reason: payload.reason_code,
        },
      );
      return;
    }

    if (isTaskChannel && message.type === 'clarification_request') {
    const payload = message.payload as unknown as Record<string, unknown>;
      this.recordChannelEvent(
        'clarification_requested',
        `Clarification requested: ${payload.question ?? payload.content ?? 'question'}`,
        message,
      );
      return;
    }

    if (!isTaskChannel && message.type === 'status_update' && message.room_id === 'operator') {
      const statusMessage = message as MessageEnvelope<'status_update'>;
      if (isCancellationMessage(statusMessage)) {
        this.handleCancellation(statusMessage);
        return;
      }
      this.handleOperatorStatusMessage(statusMessage);
      return;
    }

    if (!isTaskChannel && message.type === 'task_created') {
      this.handleTaskCreated(message as MessageEnvelope<'task_created'>);
      return;
    }

    if (message.type === 'chat' && message.room_id === 'operator') {
      await this.handleOperatorChat(message as MessageEnvelope<'chat'>);
    }
  }

  handleAgentAssignment(taskId: string, agents: SpawnedAgent[]): void {
    if (!agents.length) {
      return;
    }

    for (const agent of agents) {
      this.agentAttemptMap.set(agent.agentName, agent.attemptId);
    }

    const details = agents.map((agent) => `${agent.agentName} (${agent.role})`).join(', ');
    const assignmentId = randomUUID();
    this.options.gateway.send(buildTaskAssignedMessage(
      this.options.config,
      taskId,
      taskId,
      assignmentId,
      agents,
    ));
    this.sendStatusUpdate(
      taskId,
      taskId,
      'execution',
      'agent_assigned',
      `Assigned agents: ${details}.`,
      {
        assignment_id: assignmentId,
        assigned_agents: agents.map((agent) => ({
          agent_name: agent.agentName,
          agent_role: agent.role,
          attempt_id: agent.attemptId,
        })),
      },
    );
  }

  handleAgentResultFromSupervisor = (
    taskId: string,
    attemptId: string,
    agentName: string,
    role: string,
    result: CodexAgentResult,
  ): void => {
    this.recordExecutionEvent(
      'agent_result',
      `Agent ${agentName} reported ${result.status}`,
      {
        taskId,
        attemptId,
        agentName,
        role,
        status: result.status,
        summary: result.summary,
      },
    );
    this.options.scheduler.handleAgentResult(taskId, attemptId, agentName, role, result);
  };

  handleAgentCommunication(taskId: string, content: string): void {
    this.sendStatusUpdate(taskId, taskId, 'execution', 'agent_communication', content);
  }

  private async handleTaskCreated(message: MessageEnvelope<'task_created'>): Promise<void> {
    const task = resolveTaskFromMessage(message);
    if (!task) {
      return;
    }

    this.options.registry.register(task);
    this.options.gateway.watchTaskChannel(task.taskId);
    const persisted = this.options.persistenceService.createTask({
      taskId: task.taskId,
      name: task.title ?? task.taskId,
      priority: this.normalizePriority(task.priority),
      metadata: {
        description: task.description,
        task_type: task.taskType,
        created_by: task.createdByUserId,
        branch_name: task.branchName,
      },
    });
    this.options.gateway.send(
      buildTaskIntakeAccepted(this.options.config, task.taskId),
    );
    this.scheduleTask(persisted.taskId);
  }

  private handleCancellation(message: MessageEnvelope<'status_update'>): void {
    const task = resolveTaskFromMessage(message);
    if (!task) {
      return;
    }

    const removedAgents = this.options.supervisor.cancelTask(task.taskId);
    this.options.persistenceService.setTaskStatus(task.taskId, 'cancelled');
    this.options.gateway.send(
      buildOrchestratorStatusUpdate(
        this.options.config,
        'operator',
        'operator',
        'task_cancelled',
        'Task cancelled.',
        task.taskId,
        {
          removed_agents: removedAgents,
          removed_agent_count: removedAgents.length,
        },
      ),
    );
    const persisted = this.options.persistenceService.getTask(task.taskId);
    if (persisted) {
      this.options.runLifecycle.cancelRunById(persisted.runId, 'Operator cancelled task');
    }
  }

  private async handleOperatorChat(message: MessageEnvelope<'chat'>): Promise<void> {
    const payload = message.payload as unknown as Record<string, unknown>;
    const content = typeof payload.content === 'string' ? payload.content : '';
    if (!content) {
      return;
    }

    const metadataTaskId = typeof payload.metadata === 'object' && payload.metadata !== null
      ? (payload.metadata as Record<string, unknown>).task_id
      : undefined;
    const resolvedTaskId = message.task_id ?? (typeof metadataTaskId === 'string' ? metadataTaskId : undefined);
    const intent = parseOperatorIntent(content, resolvedTaskId);

    this.sendStatusUpdate(
      'operator',
      undefined,
      'operator_instruction',
      'processing_operator_instruction',
      'Processing operator instruction.',
    );

    if (intent.category === 'command_error') {
      this.options.controlService.recordRejectedCommand(
        intent.referencedTaskId,
        content,
        message.from.actor_name,
        intent.message,
      );
      this.options.gateway.send(buildOperatorChatResponse(this.options.config, intent.message));
      return;
    }

    if (intent.category === 'note') {
      try {
        const response = await this.options.chatResponder.respond(content);
        this.options.gateway.send(buildOperatorChatResponse(this.options.config, response));
      } catch (error) {
        this.options.gateway.send(
          buildOperatorChatResponse(
            this.options.config,
            error instanceof Error ? error.message : 'Failed to process operator instruction.',
          ),
        );
      }
      return;
    }

    await this.handleOperatorCommand(intent.action, message, intent.referencedTaskId ?? resolvedTaskId);
  }

  private handleOperatorStatusMessage(message: MessageEnvelope<'status_update'>): void {
    const metadata = typeof message.payload.metadata === 'object' && message.payload.metadata !== null
      ? (message.payload.metadata as Record<string, unknown>)
      : undefined;
    const taskId = message.task_id ?? (typeof metadata?.task_id === 'string' ? metadata.task_id : undefined);
    if (!taskId) {
      return;
    }

    const status = typeof metadata?.status === 'string' ? metadata.status : undefined;
    if (status === 'review') {
      this.sendStatusUpdate(
        'operator',
        taskId,
        'operator_review',
        'operator_review_notice',
        buildReviewAnnouncement(message.from.actor_name),
      );
    }
  }

  private normalizePriority(value?: string): PersistedTask['priority'] {
    if (!value) {
      return 'medium';
    }

    if (['low', 'medium', 'high', 'urgent'].includes(value)) {
      return value as PersistedTask['priority'];
    }

    return 'medium';
  }

  private persistArtifact(message: MessageEnvelope<'artifact_created'>): void {
    const attemptId = this.agentAttemptMap.get(message.from.actor_name);
    if (!attemptId) {
      console.warn('[OrchestratorEngine] missing attempt for artifact', message.payload.artifact_id);
      return;
    }

    const metadata = typeof message.payload.metadata === 'object' && message.payload.metadata !== null
      ? (message.payload.metadata as Record<string, unknown>)
      : undefined;

    this.recordChannelEvent(
      'artifact_created',
      `Artifact ${message.payload.artifact_id} (${message.payload.kind})`,
      message,
      {
        artifactId: message.payload.artifact_id,
        kind: message.payload.kind,
        summary: message.payload.summary,
      },
    );

    this.options.persistenceService.recordArtifact({
      artifactId: message.payload.artifact_id,
      attemptId,
      taskId: message.payload.task_id,
      kind: message.payload.kind,
      summary: message.payload.summary,
      content: message.payload.content,
      metadata,
      createdAt: message.timestamp,
    });

    this.options.scheduler.handleArtifactRecorded(
      message.payload.task_id,
      attemptId,
      message.payload.kind,
      message.payload.summary,
    );
  }

  private sendStatusUpdate(
    roomId: string,
    taskId: string | undefined,
    phase: string,
    statusCode: string,
    content: string,
    extraPayload?: Record<string, unknown>,
  ): void {
    this.options.gateway.send(
      buildOrchestratorStatusUpdate(
        this.options.config,
        roomId,
        phase,
        statusCode,
        content,
        taskId,
        extraPayload,
      ),
    );
  }

  private recordExecutionEvent(
    eventType: ExecutionEventRecord['eventType'],
    detail: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.options.persistenceService.recordExecutionEvent(eventType, detail, metadata);
  }

  private recordChannelEvent(
    eventType: ExecutionEventRecord['eventType'],
    detail: string,
    message: MessageEnvelope,
    metadata?: Record<string, unknown>,
  ): void {
    this.recordExecutionEvent(
      eventType,
      detail,
      {
        taskId: message.task_id,
        actor_type: message.from.actor_type,
        actor_id: message.from.actor_id,
        actor_name: message.from.actor_name,
        ...metadata,
      },
    );
  }

  private async handleOperatorCommand(
    action: OperatorControlAction,
    message: MessageEnvelope<'chat'>,
    taskId?: string,
  ): Promise<void> {
    if (!taskId) {
      this.options.gateway.send(buildOperatorChatResponse(
        this.options.config,
        'Could not determine which task you meant; please include a task identifier.',
      ));
      return;
    }

    const detail = action.reason ?? message.payload.content ?? action.type;
    const outcome = this.options.controlService.execute(action, taskId, message.from.actor_name, detail);

    if (outcome.actionType === 'cancel_task') {
      const removedAgents = outcome.removedAgents ?? [];
      this.options.gateway.send(
        buildOrchestratorStatusUpdate(
          this.options.config,
          'operator',
          'operator',
          'task_cancelled',
          `Cancelled task per operator: ${detail}`,
          taskId,
          {
            removed_agents: removedAgents,
            removed_agent_count: removedAgents.length,
          },
        ),
      );
    }

    if (outcome.reviewRequested) {
      this.onVerificationRequested(taskId, 'operator_review', message.from.actor_name, detail);
    }

    if (outcome.priority) {
      this.sendStatusUpdate(
        'operator',
        taskId,
        'operator_instruction',
        'reprioritized',
        `Updated priority to ${outcome.priority}.`,
      );
    }

    this.options.gateway.send(buildOperatorChatResponse(
      this.options.config,
      `Recorded operator action: ${outcome.actionType}.`,
    ));
  }

  private scheduleTask(taskId: string): void {
    this.options.scheduler.handleNewTask(taskId);
  }

  private log(...items: unknown[]): void {
    console.log(this.prefix, ...items);
  }

  onPlanProposed = (
    taskId: string,
    planId: string,
    summary: string,
    plan?: string,
    dependencies?: string[],
  ): void => {
    this.recordExecutionEvent(
      'plan_proposed',
      `Plan ${planId} proposed for ${taskId}`,
      {
        taskId,
        planId,
        dependencies,
        summary,
      },
    );
    this.options.gateway.send(
      buildPlanProposedMessage(
        this.options.config,
        taskId,
        planId,
        summary,
        plan,
        dependencies,
      ),
    );
  };

  onCheckpointCreated = (
    taskId: string,
    checkpointId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ): void => {
    this.recordExecutionEvent(
      'checkpoint_created',
      `Checkpoint ${checkpointId} for ${taskId}`,
      {
        taskId,
        checkpointId,
        metadata,
      },
    );
    this.options.gateway.send(
      buildCheckpointCreatedMessage(
        this.options.config,
        taskId,
        taskId,
        checkpointId,
        summary,
        metadata,
      ),
    );
  };

  onVerificationRequested = (
    taskId: string,
    verificationType: string,
    requestedBy: string,
    detail?: string,
  ): void => {
    this.recordExecutionEvent(
      'verification_requested',
      `Verification ${verificationType} requested for ${taskId}`,
      {
        taskId,
        verificationType,
        requestedBy,
        detail,
      },
    );
    this.options.gateway.send(
      buildVerificationRequestedMessage(
        this.options.config,
        taskId,
        verificationType,
        requestedBy,
        detail,
      ),
    );
    this.sendStatusUpdate(
      'operator',
      taskId,
      'operator_review',
      'verification_requested',
      'Verification requested for task.',
      { verification_type: verificationType, detail },
    );
  };

  onVerificationOutcome = (
    taskId: string,
    stage: 'verification' | 'review',
    status: 'passed' | 'failed' | 'blocked',
    summary?: string,
    attemptId?: string,
    reviewer?: string,
  ): void => {
    this.options.gateway.send(
      buildVerificationCompletedMessage(
        this.options.config,
        taskId,
        stage,
        status,
        reviewer ?? this.options.config.agentName,
        summary,
      ),
    );

    this.sendStatusUpdate(
      'operator',
      taskId,
      'operator_review',
      stage === 'verification' ? 'verification_completed' : 'review_completed',
      `${stage} ${status}`,
      {
        stage,
        status,
        attempt_id: attemptId,
        reviewer,
      },
    );
  };
}
