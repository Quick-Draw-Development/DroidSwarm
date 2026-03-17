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
import type { MessageEnvelope, OrchestratorConfig, PersistedTask, SpawnedAgent } from '../types';
import { buildReviewAnnouncement } from '../operator-notifications';
import { TaskRegistry } from '../task-registry';
import type { OrchestratorPersistenceService } from '../persistence/service';
import { SocketGateway, MessageSource } from '../socket/SocketGateway';
import { TaskScheduler } from '../scheduler/TaskScheduler';
import { AgentSupervisor } from '../AgentSupervisor';
import { OperatorActionService } from '../operator/OperatorActionService';
import { OperatorChatResponder } from '../operator/OperatorChatResponder';
import { OperatorControlAction, parseOperatorIntent } from '../operator/operator-intents';
import type { TaskSchedulerEvents } from '../scheduler/TaskScheduler';

export interface OrchestratorEngineOptions {
  config: OrchestratorConfig;
  persistenceService: OrchestratorPersistenceService;
  scheduler: TaskScheduler;
  supervisor: AgentSupervisor;
  gateway: SocketGateway;
  chatResponder: OperatorChatResponder;
  controlService: OperatorActionService;
  registry: TaskRegistry;
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
      this.persistArtifact(message);
      return;
    }

    if (!isTaskChannel && message.type === 'status_update' && message.room_id === 'operator') {
      this.handleOperatorStatusMessage(message);
      return;
    }

    if (!isTaskChannel && message.type === 'task_created') {
      this.handleTaskCreated(message);
      return;
    }

    if (!isTaskChannel && isCancellationMessage(message)) {
      this.handleCancellation(message);
      return;
    }

    if (message.type === 'chat' && message.room_id === 'operator') {
      await this.handleOperatorChat(message);
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

  handleAgentCommunication(taskId: string, content: string): void {
    this.sendStatusUpdate(taskId, taskId, 'execution', 'agent_communication', content);
  }

  private async handleTaskCreated(message: MessageEnvelope): Promise<void> {
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

  private handleCancellation(message: MessageEnvelope): void {
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
  }

  private async handleOperatorChat(message: MessageEnvelope): Promise<void> {
    const content = typeof message.payload.content === 'string' ? message.payload.content : '';
    if (!content) {
      return;
    }

    const metadataTaskId = typeof message.payload.metadata === 'object' && message.payload.metadata !== null
      ? (message.payload.metadata as Record<string, unknown>).task_id
      : undefined;
    const resolvedTaskId = message.task_id ?? (typeof metadataTaskId === 'string' ? metadataTaskId : undefined);
    const intent = parseOperatorIntent(content, resolvedTaskId);

    this.sendStatusUpdate(
      'operator',
      undefined,
      'operator_instruction',
      'Processing operator instruction.',
    );

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

  private handleOperatorStatusMessage(message: MessageEnvelope): void {
    const metadata = typeof message.payload.metadata === 'object' && message.payload.metadata !== null
      ? (message.payload.metadata as Record<string, unknown>)
      : undefined;
    const taskId = message.task_id ?? (typeof metadata?.task_id === 'string' ? metadata.task_id : undefined);
    if (!taskId) {
      return;
    }

    const status = typeof metadata?.status === 'string' ? metadata.status : undefined;
    if (status === 'review') {
      this.sendStatusUpdate('operator', taskId, 'operator_review', buildReviewAnnouncement(message.from.actor_name));
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

  private async handleOperatorCommand(
    action: OperatorControlAction,
    message: MessageEnvelope,
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
      this.handleVerificationRequested(taskId, 'operator_review', message.from.actor_name, detail);
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

  handlePlanProposed = (
    taskId: string,
    planId: string,
    summary: string,
    plan?: string,
    dependencies?: string[],
  ): void => {
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

  handleCheckpointCreated = (
    taskId: string,
    checkpointId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ): void => {
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

  handleVerificationRequested = (
    taskId: string,
    verificationType: string,
    requestedBy: string,
    detail?: string,
  ): void => {
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

  handleVerificationOutcome = (
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
