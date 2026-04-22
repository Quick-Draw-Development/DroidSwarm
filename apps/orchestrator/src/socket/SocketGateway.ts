import WebSocket from 'ws';

import {
  buildAuthMessage,
  buildHeartbeatMessage,
  buildRoomAuthMessage,
  buildRoomHeartbeatMessage,
  parseEnvelope,
} from '../protocol';
import type { MessageEnvelope, OrchestratorConfig } from '../types';

export type MessageSource = 'operator' | 'task';
export type SocketGatewayMessageHandler =
  (message: MessageEnvelope, source: MessageSource) => void | Promise<void>;

export class SocketGateway {
  private socket?: WebSocket;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;
  private readonly prefix = '[SocketGateway]';
  private readonly channelSockets = new Map<string, WebSocket>();
  private readonly channelHeartbeats = new Map<string, NodeJS.Timeout>();
  private readonly channelReconnects = new Map<string, NodeJS.Timeout>();
  private messageHandler?: SocketGatewayMessageHandler;

  constructor(private readonly config: OrchestratorConfig) {}

  private log(...args: unknown[]): void {
    if (!this.config.debug) {
      return;
    }
    console.log(this.prefix, ...args);
  }

  setMessageHandler(handler: SocketGatewayMessageHandler): void {
    this.messageHandler = handler;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    for (const timer of this.channelReconnects.values()) {
      clearTimeout(timer);
    }
    this.channelReconnects.clear();
    for (const timer of this.channelHeartbeats.values()) {
      clearInterval(timer);
    }
    this.channelHeartbeats.clear();
    for (const socket of this.channelSockets.values()) {
      socket.close();
    }
    this.channelSockets.clear();
    if (this.socket) {
      this.socket.close();
    }
  }

  send(message: MessageEnvelope | ReturnType<typeof buildAuthMessage>): void {
    if ('message_id' in message) {
      this.log('sending operator message', {
        type: message.type,
        normalizedVerb: message.verb,
        taskId: message.task_id,
        roomId: message.room_id,
        messageId: message.message_id,
      });
    }
    this.sendToSocket(this.socket, message);
  }

  sendToTask(taskId: string, message: MessageEnvelope): void {
    const channelSocket = this.channelSockets.get(taskId);
    if (!channelSocket) {
      console.warn('[SocketGateway] task channel not open for', taskId);
      return;
    }
    this.log('sending task message', {
      taskId,
      type: message.type,
      normalizedVerb: message.verb,
      messageId: message.message_id,
    });
    this.sendToSocket(channelSocket, message);
  }

  watchTaskChannel(taskId: string): void {
    if (this.stopped || this.channelSockets.has(taskId)) {
      return;
    }

    const agentName = `${this.config.agentName}-${taskId}`;
    const channelSocket = new WebSocket(this.config.socketUrl);
    this.channelSockets.set(taskId, channelSocket);
    this.log('connecting to task channel', taskId);

    channelSocket.on('open', () => {
      this.clearChannelReconnect(taskId);
      this.sendToSocket(
        channelSocket,
        buildRoomAuthMessage(this.config, taskId, agentName, 'orchestrator'),
      );
      this.startChannelHeartbeat(taskId, channelSocket, agentName);
    });

    channelSocket.on('message', (raw) => {
      this.emitMessage(raw, 'task');
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

  private connect(): void {
    const socket = new WebSocket(this.config.socketUrl);
    this.socket = socket;
    this.log('connecting to socket server at', this.config.socketUrl);

    socket.on('open', () => {
      this.send(buildAuthMessage(this.config));
      this.startHeartbeat();
      this.log('connection established');
    });

    socket.on('message', (raw) => {
      this.emitMessage(raw, 'operator');
    });

    socket.on('close', () => {
      this.clearHeartbeat();
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.connect();
        }, this.config.reconnectMs);
      }
    });

    socket.on('error', () => {
      socket.close();
    });
  }

  private emitMessage(raw: WebSocket.RawData, source: MessageSource): void {
    if (!this.messageHandler) {
      return;
    }

    try {
      const message = parseEnvelope(raw.toString());
      this.log('received message', {
        source,
        type: message.type,
        normalizedVerb: message.verb,
        taskId: message.task_id,
        roomId: message.room_id,
        messageId: message.message_id,
      });
      void this.messageHandler(message, source);
    } catch {
      // ignore unparsable messages
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(buildHeartbeatMessage(this.config));
    }, this.config.heartbeatMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
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
    if (timer) {
      clearInterval(timer);
      this.channelHeartbeats.delete(taskId);
    }
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
    if (timer) {
      clearTimeout(timer);
      this.channelReconnects.delete(taskId);
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
}
