import { randomUUID } from 'node:crypto';

import {
  buildCheckpointCreatedMessage,
  buildOperatorChatResponse,
  buildOrchestratorStatusUpdate,
  buildPlanProposedMessage,
  buildTaskAssignedMessage,
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
import { OperatorCommandHandler } from '../operator/OperatorCommandHandler';
import type { TaskSchedulerEvents } from '../scheduler/TaskScheduler';

export interface OrchestratorEngineOptions {
  config: OrchestratorConfig;
  persistenceService: OrchestratorPersistenceService;
  scheduler: TaskScheduler;
  supervisor: AgentSupervisor;
  gateway: SocketGateway;
  commandHandler: OperatorCommandHandler;
  registry: TaskRegistry;
}

export class OrchestratorEngine implements TaskSchedulerEvents {
  private readonly prefix = '[OrchestratorEngine]';

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

    this.sendStatusUpdate(
      'operator',
      undefined,
      'operator_instruction',
      'Processing operator instruction.',
    );

    try {
      const response = await this.options.commandHandler.process(content);
      this.options.gateway.send(buildOperatorChatResponse(this.options.config, response));
    } catch (error) {
      this.options.gateway.send(
        buildOperatorChatResponse(
          this.options.config,
          error instanceof Error ? error.message : 'Failed to process operator instruction.',
        ),
      );
    }
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
}
