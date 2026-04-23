import type { SocketGateway, MessageSource } from '../socket/SocketGateway';
import type { OperatorChatResponder } from '../operator/OperatorChatResponder';
import type { OperatorActionService } from '../operator/OperatorActionService';
import type { WorkerRegistry } from '../worker-registry';
import type { RunLifecycleService } from '../run-lifecycle';
import type { ToolService } from '../tools/ToolService';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type { TaskScheduler } from '../scheduler/TaskScheduler';
import type { AgentSupervisor } from '../AgentSupervisor';
import type { CodexAgentResult, MessageEnvelope, OrchestratorConfig, SpawnedAgent } from '../types';
import type { StatusUpdatePayload, ToolRequestPayload } from '@protocol';
import { postToBus } from '@federation-bus';
import {
  buildCheckpointCreatedMessage,
  buildOperatorChatResponse,
  buildPlanProposedMessage,
  buildTaskAssignedMessage,
  buildToolResponseMessage,
  buildVerificationCompletedMessage,
  buildVerificationRequestedMessage,
} from '../messages';

type EngineDeps = {
  config: OrchestratorConfig;
  persistenceService: OrchestratorPersistenceService;
  scheduler: TaskScheduler;
  supervisor: AgentSupervisor;
  gateway: SocketGateway;
  chatResponder: OperatorChatResponder;
  controlService: OperatorActionService;
  registry: WorkerRegistry;
  runLifecycle: RunLifecycleService;
  toolService: ToolService;
};

type FederationDriftReport = {
  taskId: string;
  detail: string;
  nodeId?: string;
  reportedDigestHash?: string;
  expectedDigestHash?: string;
  reportedHandoffHash?: string;
  expectedHandoffHash?: string;
  detectedAt: string;
};

export class OrchestratorEngine {
  private readonly attemptMap = new Map<string, { taskId: string; role: string; agentName: string }>();

  constructor(private readonly deps: EngineDeps) {}

  private log(event: string, detail?: Record<string, unknown>): void {
    if (!this.deps.config.debug) {
      return;
    }
    if (detail) {
      console.log('[OrchestratorEngine]', event, detail);
      return;
    }
    console.log('[OrchestratorEngine]', event);
  }

  readonly onPlanProposed = (
    taskId: string,
    planId: string,
    summary: string,
    plan?: string,
    dependencies?: string[],
  ): void => {
    this.deps.persistenceService.recordExecutionEvent('plan_proposed', summary, {
      taskId,
      planId,
      dependencies,
    }, {
      taskId,
      normalizedVerb: 'plan.proposed',
      transportBody: {
        taskId,
        planId,
        summary,
        plan,
        dependencies,
      },
    });
    this.deps.gateway.send(buildPlanProposedMessage(this.deps.config, taskId, planId, summary, plan, dependencies));
  };

  readonly onCheckpointCreated = (
    taskId: string,
    checkpointId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ): void => {
    this.deps.persistenceService.recordExecutionEvent('checkpoint_created', summary, {
      taskId,
      checkpointId,
      metadata,
    }, {
      taskId,
      normalizedVerb: 'checkpoint.created',
      transportBody: {
        checkpointId,
        taskId,
        summary,
        metadata,
      },
    });
    this.deps.gateway.send(buildCheckpointCreatedMessage(
      this.deps.config,
      taskId,
      taskId,
      checkpointId,
      summary,
      metadata,
    ));
  };

  readonly onVerificationRequested = (
    taskId: string,
    verificationType: string,
    requestedBy: string,
    detail?: string,
  ): void => {
    this.deps.persistenceService.recordExecutionEvent('verification_requested', detail ?? verificationType, {
      taskId,
      verificationType,
      requestedBy,
    }, {
      taskId,
      normalizedVerb: 'verification.requested',
      transportBody: {
        taskId,
        verificationType,
        requestedBy,
        detail,
      },
    });
    this.deps.gateway.send(buildVerificationRequestedMessage(
      this.deps.config,
      taskId,
      verificationType,
      requestedBy,
      detail,
    ));
  };

  readonly onVerificationOutcome = (
    taskId: string,
    stage: 'verification' | 'review',
    status: 'passed' | 'failed' | 'blocked',
    summary?: string,
    attemptId?: string,
    reviewer?: string,
  ): void => {
    this.deps.persistenceService.recordExecutionEvent('verification_completed', summary ?? status, {
      taskId,
      stage,
      status,
      attemptId,
      reviewer,
    }, {
      taskId,
      normalizedVerb: 'verification.completed',
      transportBody: {
        taskId,
        stage,
        status,
        summary,
        attemptId,
        reviewer,
      },
    });
    this.deps.gateway.send(buildVerificationCompletedMessage(
      this.deps.config,
      taskId,
      stage,
      status,
      reviewer ?? this.deps.config.agentName,
      summary,
    ));
  };

  handleAgentAssignment(taskId: string, agents: SpawnedAgent[]): void {
    this.log('agents.assigned', {
      taskId,
      agentCount: agents.length,
      agents: agents.map((agent) => ({
        attemptId: agent.attemptId,
        agentName: agent.agentName,
        role: agent.role,
      })),
    });
    for (const agent of agents) {
      this.attemptMap.set(agent.attemptId, {
        taskId: agent.taskId,
        role: agent.role,
        agentName: agent.agentName,
      });
    }
    const assignmentId = `${taskId}-${agents.map((agent) => agent.attemptId).join('-')}`;
    this.deps.gateway.send(buildTaskAssignedMessage(this.deps.config, taskId, taskId, assignmentId, agents));
  }

  handleAgentCommunication(_taskId: string, _message: string): void {
    // Runtime-only chatter is intentionally left out of persistence.
  }

  async handleMessage(message: MessageEnvelope, source: MessageSource): Promise<void> {
    this.log('message.received', {
      source,
      type: message.type,
      normalizedVerb: message.verb,
      taskId: message.task_id ?? message.room_id,
      actorId: message.from.actor_id,
      actorName: message.from.actor_name,
      messageId: message.message_id,
    });
    if (message.type === 'task_created') {
      this.handleTaskCreated(message);
      return;
    }
    if (message.type === 'tool_request') {
      await this.handleToolRequest(message);
      return;
    }
    if (message.type === 'chat' && source === 'operator') {
      const content = await this.deps.chatResponder.respond(message.payload.content);
      this.deps.gateway.send(buildOperatorChatResponse(this.deps.config, content));
      return;
    }
    if (message.type !== 'status_update') {
      return;
    }
    this.handleStatusUpdate(message);
  }

  private handleTaskCreated(message: MessageEnvelope<'task_created'>): void {
    const payload = message.payload;
    this.log('task.created', {
      taskId: payload.task_id,
      title: payload.title,
      priority: payload.priority,
      createdBy: payload.created_by ?? payload.created_by_user_id,
    });
    const task = this.deps.persistenceService.createTask({
      taskId: payload.task_id,
      name: payload.title ?? payload.task_id,
      priority: (payload.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined) ?? 'medium',
      status: 'planning',
      metadata: {
        description: payload.description ?? '',
        task_type: payload.task_type ?? 'task',
        created_by: payload.created_by ?? payload.created_by_user_id ?? 'operator',
        branch_name: payload.branch_name,
        queue_depth: 0,
        fallback_count: 0,
      },
    });
    this.deps.registry.register({
      taskId: task.taskId,
      projectId: task.projectId,
      repoId: task.repoId,
      rootPath: task.rootPath,
      workspaceId: task.workspaceId,
      title: task.name,
      description: String(task.metadata?.description ?? ''),
      taskType: String(task.metadata?.task_type ?? 'task'),
      priority: task.priority,
      createdAt: task.createdAt,
      createdByUserId: typeof task.metadata?.created_by === 'string' ? task.metadata.created_by : undefined,
      branchName: typeof task.metadata?.branch_name === 'string' ? task.metadata.branch_name : undefined,
    });
    this.deps.gateway.watchTaskChannel(task.taskId);
    this.log('task.scheduling.requested', {
      taskId: task.taskId,
      runId: task.runId,
      status: task.status,
    });
    this.deps.scheduler.handleNewTask(task.taskId);
  }

  private handleStatusUpdate(message: MessageEnvelope<'status_update'>): void {
    const payload = message.payload as StatusUpdatePayload & { result?: CodexAgentResult };
    const taskId = message.task_id ?? message.room_id;
    this.log('status.update.received', {
      taskId,
      actorId: message.from.actor_id,
      actorName: message.from.actor_name,
      statusCode: payload.status_code,
      normalizedVerb: message.verb,
    });
    if (payload.status_code === 'task_cancelled') {
      const detail = payload.content;
      this.deps.controlService.execute({ type: 'cancel_task' }, taskId, message.from.actor_name, detail);
      return;
    }
    if (!payload.result || !['agent_completed', 'agent_blocked', 'agent_failed'].includes(payload.status_code)) {
      return;
    }
    const federationDrift = this.detectFederationDrift(taskId, payload.metadata);
    if (federationDrift) {
      this.deps.persistenceService.recordExecutionEvent('agent_result', federationDrift.detail, {
        taskId,
        drift: federationDrift,
      }, {
        taskId,
        normalizedVerb: 'drift.detected',
        transportBody: federationDrift,
      });
      void this.broadcastFederationDrift(taskId, federationDrift);
    }
    const attempt = this.lookupAttempt(taskId, message.from.actor_id, message.from.actor_name);
    if (!attempt) {
      this.log('status.update.unmatched', {
        taskId,
        actorId: message.from.actor_id,
        statusCode: payload.status_code,
      });
      return;
    }
    this.deps.persistenceService.recordExecutionEvent('agent_result', payload.content, {
      taskId,
      attemptId: attempt.attemptId,
      agentName: attempt.agentName,
      role: attempt.role,
      verb: message.verb,
      shorthand: message.shorthand,
    });
    this.deps.scheduler.handleAgentResult(taskId, attempt.attemptId, attempt.agentName, attempt.role, payload.result);
  }

  private detectFederationDrift(
    taskId: string,
    metadata: Record<string, unknown> | undefined,
  ): FederationDriftReport | undefined {
    if (!metadata) {
      return undefined;
    }

    const latestDigest = this.deps.persistenceService.getLatestTaskStateDigest(taskId);
    const latestHandoff = this.deps.persistenceService.getLatestHandoffPacket(taskId);
    const reportedDigestHash = typeof metadata.digestHash === 'string' ? metadata.digestHash : undefined;
    const reportedHandoffHash = typeof metadata.handoffHash === 'string' ? metadata.handoffHash : undefined;
    const expectedDigestHash = latestDigest?.federationHash;
    const expectedHandoffHash = latestHandoff?.federationHash;

    if (
      (!reportedDigestHash || !expectedDigestHash || reportedDigestHash === expectedDigestHash)
      && (!reportedHandoffHash || !expectedHandoffHash || reportedHandoffHash === expectedHandoffHash)
    ) {
      return undefined;
    }

    return {
      taskId,
      detail: `Federation drift detected for ${taskId}.`,
      nodeId: typeof metadata.federationNodeId === 'string' ? metadata.federationNodeId : undefined,
      reportedDigestHash,
      expectedDigestHash,
      reportedHandoffHash,
      expectedHandoffHash,
      detectedAt: new Date().toISOString(),
    };
  }

  private async broadcastFederationDrift(taskId: string, drift: FederationDriftReport): Promise<void> {
    if (!this.deps.config.federationEnabled || !this.deps.config.federationBusUrl) {
      return;
    }

    try {
      await postToBus(this.deps.config.federationBusUrl, {
        sourceNodeId: this.deps.config.federationNodeId ?? this.deps.config.projectId,
        envelope: {
          id: `drift-${taskId}-${Date.now()}`,
          ts: new Date().toISOString(),
          project_id: this.deps.config.projectId,
          swarm_id: this.deps.config.federationNodeId,
          task_id: taskId,
          room_id: taskId,
          agent_id: this.deps.config.agentName,
          role: this.deps.config.agentRole,
          verb: 'drift.detected',
          body: drift,
        },
      }, this.deps.config.federationSigningKeyId && this.deps.config.federationSigningPrivateKey
        ? {
          keyId: this.deps.config.federationSigningKeyId,
          privateKeyPem: this.deps.config.federationSigningPrivateKey,
        }
        : undefined);
    } catch (error) {
      this.log('federation.drift.broadcast.failed', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleToolRequest(message: MessageEnvelope<'tool_request'>): Promise<void> {
    const payload = message.payload as ToolRequestPayload;
    this.log('tool.request.received', {
      taskId: message.task_id ?? message.room_id,
      requestId: payload.request_id,
      toolName: payload.tool_name,
      actorId: message.from.actor_id,
      actorName: message.from.actor_name,
    });
    const response = await this.deps.toolService.handleRequest({
      requestId: payload.request_id,
      toolName: payload.tool_name,
      taskId: message.task_id ?? message.room_id,
      agentName: message.from.actor_id,
      parameters: payload.parameters,
    });
    this.deps.gateway.send(buildToolResponseMessage(
      this.deps.config,
      message.task_id ?? message.room_id,
      payload.request_id,
      response.status,
      response.result,
      response.error,
    ));
  }

  private lookupAttempt(taskId: string, actorId: string, actorName?: string): { attemptId: string; taskId: string; role: string; agentName: string } | undefined {
    for (const [attemptId, attempt] of this.attemptMap.entries()) {
      if (
        attempt.taskId === taskId
        && (attempt.agentName === actorId || (actorName && attempt.agentName === actorName))
      ) {
        return { attemptId, ...attempt };
      }
    }
    const attempts = this.deps.persistenceService.listAttemptsForTask(taskId);
    const matched = attempts.find((attempt) => attempt.agentName === actorId || (actorName && attempt.agentName === actorName));
    if (!matched) {
      return undefined;
    }
    const role = typeof matched.metadata?.role === 'string' ? matched.metadata.role : 'worker';
    this.attemptMap.set(matched.attemptId, { taskId, role, agentName: matched.agentName });
    return { attemptId: matched.attemptId, taskId, role, agentName: matched.agentName };
  }
}
