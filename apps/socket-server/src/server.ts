import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import type { Logger } from 'pino';
import WebSocket, { WebSocketServer } from 'ws';

import { authenticateClient, AuthenticationError } from './auth/authenticate';
import { createDatabase } from './db/client';
import { SqlitePersistence } from './db/repositories';
import { writeAuditEvent } from './logging/audit';
import { createLogger } from './logging/Logger';
import { buildAuthSuccessMessage, buildErrorMessage } from './protocol/messages';
import { isOperatorOnlyMessage, parseAuthMessage, parseIncomingEnvelope } from './protocol/validate';
import { RoomManager } from './rooms/RoomManager';
import type { AuthResult, ConnectedClient, MessageEnvelope, PersistencePort, ServerConfig, WebSocketLike } from './types';

interface SocketState {
  connectionId: string;
  authenticatedClient?: ConnectedClient;
  authenticated: boolean;
  messageTimestamps: number[];
  authTimer?: NodeJS.Timeout;
}

const HEARTBEAT_CLOSE_CODE = 4000;
const AUTH_CLOSE_CODE = 1008;
const POLICY_CLOSE_CODE = 4408;

export class DroidSwarmSocketServer {
  private readonly httpServer = createServer();
  private readonly webSocketServer = new WebSocketServer({ server: this.httpServer });
  private readonly persistence: PersistencePort;
  private readonly roomManager = new RoomManager();
  private readonly logger: Logger;
  private readonly socketStates = new WeakMap<WebSocket, SocketState>();
  private heartbeatSweep?: NodeJS.Timeout;

  constructor(private readonly config: ServerConfig) {
    const database = createDatabase(config.dbPath);
    this.persistence = new SqlitePersistence(database);
    this.persistence.migrate();
    this.logger = createLogger(config);
    this.webSocketServer.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });

    this.heartbeatSweep = setInterval(() => {
      this.sweepIdleConnections();
    }, Math.max(1_000, Math.floor(this.config.heartbeatTimeoutMs / 3)));

    this.logger.info(
      {
        host: this.config.host,
        port: this.config.port,
        projectId: this.config.projectId,
      },
      'Socket server started',
    );
  }

  async stop(): Promise<void> {
    if (this.heartbeatSweep) {
      clearInterval(this.heartbeatSweep);
      this.heartbeatSweep = undefined;
    }

    for (const client of this.webSocketServer.clients) {
      client.close();
    }

    await new Promise<void>((resolve, reject) => {
      this.webSocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        this.httpServer.close((httpError) => {
          if (httpError) {
            reject(httpError);
            return;
          }

          resolve();
        });
      });
    });

    this.persistence.close();
  }

  private handleConnection(socket: WebSocket): void {
    const connectionId = randomUUID();
    const now = new Date().toISOString();
    const state: SocketState = {
      connectionId,
      authenticated: false,
      messageTimestamps: [],
    };

    this.socketStates.set(socket, state);
    state.authTimer = setTimeout(() => {
      if (!state.authenticated) {
        this.sendRawError(socket, 'Authentication timed out', 'auth_timeout');
        socket.close(AUTH_CLOSE_CODE, 'Authentication timed out');
      }
    }, this.config.authTimeoutMs);

    this.persistence.recordConnectionOpened({
      connectionId,
      projectId: this.config.projectId,
      clientType: 'unknown',
      clientId: connectionId,
      clientName: 'pending',
      authStatus: 'pending',
      openedAt: now,
      lastSeenAt: now,
      metadata: {},
      roomId: undefined,
    });

    socket.on('message', (rawMessage) => {
      this.handleSocketMessage(socket, rawMessage.toString());
    });

    socket.on('close', (code) => {
      this.handleClose(socket, code);
    });

    socket.on('error', (error) => {
      this.logger.error({ error, connectionId }, 'Socket error');
      writeAuditEvent(this.persistence, {
        projectId: this.config.projectId,
        connectionId,
        eventType: 'socket_error',
        details: { message: error.message },
      });
    });
  }

  private handleSocketMessage(socket: WebSocket, rawMessage: string): void {
    const state = this.getSocketState(socket);
    if (!state.authenticated) {
      this.handleAuthMessage(socket, rawMessage, state);
      return;
    }

    const client = state.authenticatedClient;
    if (!client) {
      this.sendRawError(socket, 'Missing authenticated client state', 'missing_client_state');
      socket.close(POLICY_CLOSE_CODE, 'Missing authenticated client state');
      return;
    }

    client.lastSeenAt = Date.now();

    if (!this.acceptMessageUnderRateLimit(state)) {
      this.sendRoomError(client, 'Rate limit exceeded', 'rate_limit_exceeded');
      writeAuditEvent(this.persistence, {
        projectId: this.config.projectId,
        channelId: client.roomId,
        connectionId: client.connectionId,
        actorType: client.actorType,
        actorId: client.connectionId,
        eventType: 'rate_limit_exceeded',
        details: { room_id: client.roomId },
      });
      return;
    }

    let message: MessageEnvelope;
    try {
      ({ message } = parseIncomingEnvelope(rawMessage));
    } catch (error) {
      this.sendRoomError(client, 'Invalid message envelope', 'invalid_message_envelope');
      return;
    }

    if (message.project_id !== this.config.projectId || message.room_id !== client.roomId) {
      this.sendRoomError(client, 'Message project or room mismatch', 'message_scope_mismatch');
      return;
    }

    if (message.type === 'heartbeat') {
      this.persistence.recordConnectionAuth({
        connectionId: client.connectionId,
        authStatus: 'success',
        clientType: client.clientType,
        clientId: client.connectionId,
        clientName: client.agentName,
        roomId: client.roomId,
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }

    if (isOperatorOnlyMessage(message.type) && (!client.privileged || client.roomId !== 'operator')) {
      this.sendRoomError(client, 'Operator-only message type', 'operator_only_message');
      return;
    }

    const normalizedMessage: MessageEnvelope = {
      ...message,
      from: {
        actor_type: client.actorType,
        actor_id: client.connectionId,
        actor_name: client.agentName,
      },
    };

    this.persistence.ensureChannel({
      channelId: client.roomId,
      projectId: this.config.projectId,
      taskId: normalizedMessage.task_id,
      channelType: client.roomId === 'operator' ? 'operator' : 'task',
      name: client.roomId,
      status: 'active',
      createdAt: normalizedMessage.timestamp,
      updatedAt: normalizedMessage.timestamp,
    });
    this.handleRoutingSideEffects(normalizedMessage);
    this.persistence.recordMessage(normalizedMessage);
    this.roomManager.broadcast(client.roomId, normalizedMessage);
  }

  private handleRoutingSideEffects(message: MessageEnvelope): void {
    if (message.type === 'task_created') {
      const taskId = message.task_id ?? (typeof message.payload.task_id === 'string' ? message.payload.task_id : undefined);
      if (!taskId) {
        return;
      }

      this.persistence.ensureChannel({
        channelId: taskId,
        projectId: this.config.projectId,
        taskId,
        channelType: 'task',
        name: taskId,
        status: 'active',
        createdAt: message.timestamp,
        updatedAt: message.timestamp,
      });
      this.persistence.recordTaskEvent({
        eventId: randomUUID(),
        projectId: this.config.projectId,
        taskId,
        eventType: 'task_created',
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: message.payload as unknown as Record<string, unknown>,
        createdAt: message.timestamp,
      });
      writeAuditEvent(this.persistence, {
        projectId: this.config.projectId,
        taskId,
        channelId: 'operator',
        eventType: 'task_created_routed',
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        details: {
          task_id: taskId,
          routed_to_room: taskId,
        },
      });
      return;
    }

    if (message.type === 'task_intake_accepted') {
      const taskId = message.task_id ?? (typeof message.payload.task_id === 'string' ? message.payload.task_id : undefined);
      if (!taskId) {
        return;
      }

      this.persistence.recordTaskEvent({
        eventId: randomUUID(),
        projectId: this.config.projectId,
        taskId,
        eventType: 'task_intake_accepted',
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: message.payload as unknown as Record<string, unknown>,
        createdAt: message.timestamp,
      });
      return;
    }

    if (message.type === 'status_update' && message.room_id === 'operator' && message.task_id) {
      const statusCode = typeof message.payload.status_code === 'string' ? message.payload.status_code : 'task_status_changed';
      const nextStatus = typeof message.payload.metadata === 'object' && message.payload.metadata !== null && typeof (message.payload.metadata as Record<string, unknown>).status === 'string'
        ? String((message.payload.metadata as Record<string, unknown>).status)
        : undefined;

      this.persistence.recordTaskEvent({
        eventId: randomUUID(),
        projectId: this.config.projectId,
        taskId: message.task_id,
        eventType: statusCode,
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: message.payload as unknown as Record<string, unknown>,
        createdAt: message.timestamp,
      });
      writeAuditEvent(this.persistence, {
        projectId: this.config.projectId,
        taskId: message.task_id,
        channelId: message.room_id,
        eventType: statusCode === 'task_cancelled' ? 'task_cancellation_requested' : 'task_status_change_routed',
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        details: {
          task_id: message.task_id,
          next_status: nextStatus,
          orchestrator_action: statusCode === 'task_cancelled'
            ? 'stop_agents_and_remove_assignments'
            : 'reconcile_task_state',
        },
        });
    }

    if (message.type === 'tool_response' && message.task_id) {
      this.persistence.recordTaskEvent({
        eventId: randomUUID(),
        projectId: this.config.projectId,
        taskId: message.task_id,
        eventType: 'tool_response',
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: {
          payload: message.payload as unknown as Record<string, unknown>,
          usage: message.usage,
        },
        createdAt: message.timestamp,
      });
    }
  }

  private handleAuthMessage(socket: WebSocket, rawMessage: string, state: SocketState): void {
    let authMessage;
    try {
      authMessage = parseAuthMessage(rawMessage);
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : 'parse error', rawMessage }, 'Failed to parse auth message');
      this.sendRawError(socket, 'First message must be a valid auth message', 'invalid_auth_message');
      socket.close(AUTH_CLOSE_CODE, 'Invalid auth message');
      this.persistence.recordConnectionAuth({
        connectionId: state.connectionId,
        authStatus: 'failed',
        clientType: 'system',
        clientId: state.connectionId,
        clientName: 'failed-auth',
        roomId: undefined,
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const authResult = authenticateClient(this.config, authMessage);
      this.finishAuthentication(socket, state, authResult);
    } catch (error) {
      const authError = error instanceof AuthenticationError
        ? error
        : new AuthenticationError('Authentication failed', 'auth_failed');
      this.logger.warn(
        {
          reason: authError.reasonCode,
          message: authError.message,
          payload: authMessage.payload,
        },
        'Authentication failure',
      );
      this.sendRawError(socket, authError.message, authError.reasonCode, authMessage.payload.room_id);
      socket.close(AUTH_CLOSE_CODE, authError.message);
      this.persistence.recordConnectionAuth({
        connectionId: state.connectionId,
        authStatus: 'failed',
        clientType: authMessage.payload.client_type ?? 'agent',
        clientId: state.connectionId,
        clientName: authMessage.payload.agent_name,
        roomId: authMessage.payload.room_id,
        lastSeenAt: new Date().toISOString(),
      });
    }
  }

  private finishAuthentication(socket: WebSocketLike, state: SocketState, authResult: AuthResult): void {
    const client: ConnectedClient = {
      connectionId: state.connectionId,
      socket,
      roomId: authResult.roomId,
      agentName: authResult.agentName,
      agentRole: authResult.agentRole,
      clientType: authResult.clientType,
      actorType: authResult.actorType,
      privileged: authResult.privileged,
      authenticatedAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    try {
      this.roomManager.addClient(client);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Room join failed';
      this.sendRawError(socket, message, 'duplicate_agent_name', authResult.roomId);
      socket.close(AUTH_CLOSE_CODE, message);
      this.persistence.recordConnectionAuth({
        connectionId: state.connectionId,
        authStatus: 'failed',
        clientType: authResult.clientType,
        clientId: state.connectionId,
        clientName: authResult.agentName,
        roomId: authResult.roomId,
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }

    state.authenticated = true;
    state.authenticatedClient = client;
    if (state.authTimer) {
      clearTimeout(state.authTimer);
      state.authTimer = undefined;
    }

    this.persistence.ensureChannel({
      channelId: client.roomId,
      projectId: this.config.projectId,
      channelType: client.roomId === 'operator' ? 'operator' : 'task',
      name: client.roomId,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.persistence.recordConnectionAuth({
      connectionId: client.connectionId,
      authStatus: 'success',
      clientType: client.clientType,
      clientId: client.connectionId,
      clientName: client.agentName,
      roomId: client.roomId,
      lastSeenAt: new Date().toISOString(),
    });
    const response = buildAuthSuccessMessage(this.config.projectId, client);
    client.socket.send(JSON.stringify(response));
  }

  private handleClose(socket: WebSocket, closeCode: number): void {
    const state = this.socketStates.get(socket);
    if (!state) {
      return;
    }

    if (state.authTimer) {
      clearTimeout(state.authTimer);
    }

    if (state.authenticatedClient) {
      this.roomManager.removeClient(state.authenticatedClient.roomId, state.authenticatedClient.connectionId);
      this.persistence.recordConnectionClosed({
        connectionId: state.authenticatedClient.connectionId,
        closedAt: new Date().toISOString(),
        closeCode,
        lastSeenAt: new Date(state.authenticatedClient.lastSeenAt).toISOString(),
      });
    } else {
      this.persistence.recordConnectionClosed({
        connectionId: state.connectionId,
        closedAt: new Date().toISOString(),
        closeCode,
        lastSeenAt: new Date().toISOString(),
      });
    }
  }

  private sendRawError(socket: WebSocketLike, message: string, reasonCode: string, roomId = 'system'): void {
    const errorMessage = buildErrorMessage(this.config.projectId, roomId, message, reasonCode);
    socket.send(JSON.stringify(errorMessage));
  }

  private sendRoomError(client: ConnectedClient, message: string, reasonCode: string): void {
    client.socket.send(JSON.stringify(buildErrorMessage(this.config.projectId, client.roomId, message, reasonCode)));
  }

  private getSocketState(socket: WebSocket): SocketState {
    const state = this.socketStates.get(socket);
    if (!state) {
      throw new Error('Missing socket state');
    }

    return state;
  }

  private acceptMessageUnderRateLimit(state: SocketState): boolean {
    const threshold = Date.now() - this.config.messageWindowMs;
    state.messageTimestamps = state.messageTimestamps.filter((timestamp) => timestamp >= threshold);
    if (state.messageTimestamps.length >= this.config.maxMessagesPerWindow) {
      return false;
    }

    state.messageTimestamps.push(Date.now());
    return true;
  }

  private sweepIdleConnections(): void {
    const now = Date.now();
    for (const socket of this.webSocketServer.clients) {
      const state = this.socketStates.get(socket);
      if (!state?.authenticatedClient) {
        continue;
      }

      if (now - state.authenticatedClient.lastSeenAt > this.config.heartbeatTimeoutMs) {
        this.sendRoomError(state.authenticatedClient, 'Heartbeat timeout', 'heartbeat_timeout');
        socket.close(HEARTBEAT_CLOSE_CODE, 'Heartbeat timeout');
      }
    }
  }
}

export const createSocketServer = (config: ServerConfig): DroidSwarmSocketServer =>
  new DroidSwarmSocketServer(config);

export const createDefaultSocketServer = (): DroidSwarmSocketServer => {
  const { loadConfig } = require('./config') as typeof import('./config');
  return new DroidSwarmSocketServer(loadConfig());
};
