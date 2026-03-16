import WebSocket from 'ws';
import path from 'node:path';

import { AgentSupervisor } from './AgentSupervisor';
import { loadConfig } from './config';
import { runCodexPrompt } from './codex-runner';
import { buildOperatorChatResponse, buildOrchestratorStatusUpdate } from './messages';
import {
  buildAuthMessage,
  buildHeartbeatMessage,
  buildRoomAuthMessage,
  buildRoomHeartbeatMessage,
  buildTaskIntakeAccepted,
  parseEnvelope,
} from './protocol';
import { TaskRegistry } from './task-registry';
import { buildTaskCancellationAcknowledged, isCancellationMessage, resolveTaskFromMessage } from './task-events';
import { buildReviewAnnouncement } from './operator-notifications';
import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { OrchestratorPersistenceService } from './persistence/service';
import type { Database } from 'better-sqlite3';
import type { MessageEnvelope, OrchestratorConfig, PersistedTask, RunRecord, SpawnedAgent } from './types';

export class DroidSwarmOrchestratorClient {
  private socket?: WebSocket;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;
  private readonly registry = new TaskRegistry();
  private readonly supervisor: AgentSupervisor;
  private readonly prefix = '[OrchestratorClient]';
  private readonly channelSockets = new Map<string, WebSocket>();
  private readonly channelHeartbeats = new Map<string, NodeJS.Timeout>();
  private readonly channelReconnects = new Map<string, NodeJS.Timeout>();
  private readonly database: Database;
  private readonly persistence: PersistenceClient;
  private currentRun?: RunRecord;
  private persistenceService?: OrchestratorPersistenceService;

  constructor(private readonly config: OrchestratorConfig = loadConfig()) {
    this.database = openPersistenceDatabase(this.config.dbPath);
    this.persistence = PersistenceClient.fromDatabase(this.database);
    this.supervisor = new AgentSupervisor(
      config,
      this.registry,
      path.resolve(__dirname, 'main.js'),
        {
          onAgentsAssigned: (taskId, agents) => this.reportAgentAssignment(taskId, agents),
          onAgentCommunication: (taskId, message) => this.reportAgentCommunication(taskId, message),
        },
    );
  }

  start(): void {
    this.log('starting orchestrator');
    this.currentRun = this.persistence.createRun(this.config.projectId);
    this.persistenceService = new OrchestratorPersistenceService(this.persistence, this.currentRun);
    this.log('created run', this.currentRun.runId);
    this.connect();
  }

  private log(...args: unknown[]): void {
    console.log(this.prefix, ...args);
  }

  private summarizeMessage(message: MessageEnvelope): string {
    const actor = message.from?.actor_name ?? 'unknown_actor';
    return `${message.type}@${message.room_id ?? 'unknown'} task=${message.task_id ?? 'unknown'} from=${actor}`;
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

  stop(): void {
    this.stopped = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    for (const timer of this.channelReconnects.values()) {
      clearTimeout(timer);
    }
    this.channelReconnects.clear();
    for (const [taskId, socket] of this.channelSockets.entries()) {
      socket.close();
      this.clearChannelHeartbeat(taskId);
    }
    this.channelSockets.clear();
    this.socket?.close();
    this.database.close();
  }

  private connect(): void {
    const socket = new WebSocket(this.config.socketUrl);
    this.socket = socket;
    console.log('Connecting to socket server at', this.config.socketUrl);

    socket.on('open', () => {
      this.sendRaw(buildAuthMessage(this.config));
      this.startHeartbeat();
      console.log('Orchestrator connection established.');
    });

    socket.on('message', (raw) => {
      void this.handleMessage(raw.toString(), 'operator');
    });

    socket.on('close', () => {
      this.clearHeartbeat();
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, this.config.reconnectMs);
      }
    });

    socket.on('error', () => {
      socket.close();
    });
  }

  private watchTaskChannel(taskId: string): void {
    if (this.stopped || this.channelSockets.has(taskId)) {
      return;
    }

    const agentName = `${this.config.agentName}-${taskId}`;
    const channelSocket = new WebSocket(this.config.socketUrl);
    this.channelSockets.set(taskId, channelSocket);
    this.log('connecting to task channel', taskId);

    channelSocket.on('open', () => {
      this.clearChannelReconnect(taskId);
      this.sendToSocket(channelSocket, buildRoomAuthMessage(this.config, taskId, agentName, 'orchestrator'));
      this.startChannelHeartbeat(taskId, channelSocket, agentName);
    });

    channelSocket.on('message', (raw) => {
      void this.handleMessage(raw.toString(), 'task');
    });

    channelSocket.on('close', () => {
      this.clearChannelHeartbeat(taskId);
      this.channelSockets.delete(taskId);
      if (!this.stopped) {
        this.scheduleTaskChannelReconnect(taskId);
      }
    });

    channelSocket.on('error', () => {
      channelSocket.close();
    });
  }

  private scheduleTaskChannelReconnect(taskId: string): void {
    this.clearChannelReconnect(taskId);
    const timer = setTimeout(() => {
      this.channelReconnects.delete(taskId);
      this.watchTaskChannel(taskId);
    }, this.config.reconnectMs);
    this.channelReconnects.set(taskId, timer);
  }

  private clearChannelReconnect(taskId: string): void {
    const timer = this.channelReconnects.get(taskId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.channelReconnects.delete(taskId);
  }

  private startChannelHeartbeat(taskId: string, socket: WebSocket, agentName: string): void {
    this.clearChannelHeartbeat(taskId);
    const timer = setInterval(() => {
      this.sendToSocket(socket, buildRoomHeartbeatMessage(this.config, taskId, agentName));
    }, this.config.heartbeatMs);
    this.channelHeartbeats.set(taskId, timer);
  }

  private clearChannelHeartbeat(taskId: string): void {
    const timer = this.channelHeartbeats.get(taskId);
    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.channelHeartbeats.delete(taskId);
  }

  private async handleMessage(raw: string, source: 'operator' | 'task' = 'operator'): Promise<void> {
    let message: MessageEnvelope;
    try {
      message = parseEnvelope(raw);
    } catch {
      return;
    }

    const isTaskChannel = source === 'task';

    if (message.project_id !== this.config.projectId) {
      this.log('ignoring message from other project', this.summarizeMessage(message));
      return;
    }

    if (message.from.actor_name === this.config.agentName) {
      this.log('ignoring self-generated message', this.summarizeMessage(message));
      return;
    }

    this.log('received message', this.summarizeMessage(message));

    if (message.type === 'status_update' && message.room_id === 'operator') {
      this.handleOperatorStatusMessage(message);
      return;
    }

    if (!isTaskChannel && message.type === 'task_created') {
      const task = resolveTaskFromMessage(message);
      if (!task) {
        this.log('failed to resolve task from task_created event', this.summarizeMessage(message));
        return;
      }

      this.registry.register(task);
      this.watchTaskChannel(task.taskId);
      this.persistenceService?.createTask({
        taskId: task.taskId,
        name: task.title ?? task.taskId,
        priority: this.normalizePriority(task.priority),
        metadata: {
          description: task.description,
          task_type: task.taskType,
          created_by: task.createdByUserId,
        },
      });
      this.sendRaw(buildTaskIntakeAccepted(this.config, task.taskId));
      this.log('registered task and accepted intake', task.taskId, task.title ?? 'untitled');
      this.supervisor.startInitialAgents(task);
      this.log('started initial agents for task', task.taskId);
      return;
    }

    if (!isTaskChannel && isCancellationMessage(message)) {
      const task = resolveTaskFromMessage(message);
      if (!task) {
        this.log('failed to resolve task from cancellation event', this.summarizeMessage(message));
        return;
      }

      const removedAgents = this.supervisor.cancelTask(task.taskId);
      this.persistenceService?.setTaskStatus(task.taskId, 'cancelled');
      this.sendRaw(
        buildTaskCancellationAcknowledged(
          this.config.projectId,
          this.config.agentName,
          task.taskId,
          removedAgents,
        ),
      );
      return;
    }

    if (message.type === 'chat' && message.room_id === 'operator') {
      const content = typeof message.payload.content === 'string' ? message.payload.content : '';
      if (!content) {
        this.log('received empty operator chat message', this.summarizeMessage(message));
        return;
      }

      this.sendRaw(
        buildOrchestratorStatusUpdate(
          this.config,
          'operator',
          'operator_instruction',
          'processing_instruction',
          'Processing operator instruction.',
        ),
      );
      try {
      const instructionSections = [
        this.config.orchestratorRules
          ? `Orchestrator rules:\n${this.config.orchestratorRules}\n`
          : undefined,
        this.config.droidspeakRules
          ? `Droidspeak reference (droidspeak-v1):\n${this.config.droidspeakRules}\n`
          : undefined,
      ].filter(Boolean);
      const promptParts = [
        ...instructionSections,
        `You are ${this.config.agentName}, the DroidSwarm orchestrator for project ${this.config.projectName}.`,
        'Respond to the human operator message succinctly.',
        'If the message is an instruction, acknowledge it and state the next orchestration action.',
        'Do not fabricate task state or claim work that has not happened.',
        'Return a structured result with no spawned agents unless the operator explicitly asks for a new task workflow.',
        '',
        `Operator message: ${content}`,
      ];

      const result = await runCodexPrompt({
        config: this.config,
        projectRoot: this.config.projectRoot,
        prompt: promptParts.join('\n'),
      });
        this.sendRaw(buildOperatorChatResponse(this.config, result.summary));
      } catch (error) {
        this.sendRaw(
          buildOperatorChatResponse(
            this.config,
            error instanceof Error ? error.message : 'Failed to process operator instruction.',
          ),
        );
      }
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
      this.sendTaskChannelUpdate(
        taskId,
        'operator',
        'operator_review',
        buildReviewAnnouncement(message.from.actor_name),
      );
    }
  }

  private reportAgentAssignment(taskId: string, agents: SpawnedAgent[]): void {
    if (!agents.length) {
      return;
    }

    const details = agents.map((agent) => `${agent.agentName} (${agent.role})`).join(', ');
    this.sendTaskChannelUpdate(
      taskId,
      'execution',
      'agent_assigned',
      `Assigned agents: ${details}.`,
      { assigned_agents: agents.map((agent) => ({ agent_name: agent.agentName, agent_role: agent.role })) },
    );
    agents.forEach((agent) => {
      this.persistenceService?.recordAssignment(agent.agentName);
    });
  }

  private reportAgentCommunication(taskId: string, content: string): void {
    this.sendTaskChannelUpdate(taskId, 'execution', 'agent_communication', content);
  }

  private sendTaskChannelUpdate(
    taskId: string,
    phase: string,
    statusCode: string,
    content: string,
    extraPayload?: Record<string, unknown>,
  ): void {
    this.sendRaw(
      buildOrchestratorStatusUpdate(this.config, taskId, phase, statusCode, content, taskId, extraPayload),
    );
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw(buildHeartbeatMessage(this.config));
    }, this.config.heartbeatMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private sendToSocket(
    socket: WebSocket | undefined,
    message: MessageEnvelope | ReturnType<typeof buildAuthMessage>,
  ): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  }

  private sendRaw(message: MessageEnvelope | ReturnType<typeof buildAuthMessage>): void {
    this.sendToSocket(this.socket, message);
  }
}
