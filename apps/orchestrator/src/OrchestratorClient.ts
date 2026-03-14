import WebSocket from 'ws';
import path from 'node:path';

import { AgentSupervisor } from './AgentSupervisor';
import { loadConfig } from './config';
import { runCodexPrompt } from './codex-runner';
import { buildOperatorChatResponse, buildOrchestratorStatusUpdate } from './messages';
import { buildAuthMessage, buildHeartbeatMessage, buildTaskIntakeAccepted, parseEnvelope } from './protocol';
import { TaskRegistry } from './task-registry';
import { buildTaskCancellationAcknowledged, isCancellationMessage, resolveTaskFromMessage } from './task-events';
import { buildReviewAnnouncement, formatAgentAssignmentContent } from './operator-notifications';
import type { MessageEnvelope, OrchestratorConfig, SpawnedAgent } from './types';

export class DroidSwarmOrchestratorClient {
  private socket?: WebSocket;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;
  private readonly registry = new TaskRegistry();
  private readonly supervisor: AgentSupervisor;

  constructor(private readonly config: OrchestratorConfig = loadConfig()) {
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
    this.connect();
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
    this.socket?.close();
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
      void this.handleMessage(raw.toString());
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

  private async handleMessage(raw: string): Promise<void> {
    let message: MessageEnvelope;
    try {
      message = parseEnvelope(raw);
    } catch {
      return;
    }

    if (message.project_id !== this.config.projectId || message.from.actor_name === this.config.agentName) {
      return;
    }

    if (message.type === 'status_update' && message.room_id === 'operator') {
      this.handleOperatorStatusMessage(message);
      return;
    }

    if (message.type === 'task_created') {
      const task = resolveTaskFromMessage(message);
      if (!task) {
        return;
      }

      this.registry.register(task);
      this.sendRaw(buildTaskIntakeAccepted(this.config, task.taskId));
      this.supervisor.startInitialAgents(task);
      return;
    }

    if (isCancellationMessage(message)) {
      const task = resolveTaskFromMessage(message);
      if (!task) {
        return;
      }

      const removedAgents = this.supervisor.cancelTask(task.taskId);
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
    this.sendTaskChannelUpdate(taskId, 'execution', 'agent_assigned', `Assigned agents: ${details}.`);
  }

  private reportAgentCommunication(taskId: string, content: string): void {
    this.sendTaskChannelUpdate(taskId, 'execution', 'agent_communication', content);
  }

  private sendTaskChannelUpdate(
    taskId: string,
    phase: string,
    statusCode: string,
    content: string,
  ): void {
    this.sendRaw(buildOrchestratorStatusUpdate(this.config, taskId, phase, statusCode, content, taskId));
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

  private sendRaw(message: MessageEnvelope | ReturnType<typeof buildAuthMessage>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }
}
