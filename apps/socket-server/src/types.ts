import type WebSocket from 'ws';
export type {
  ActorRef,
  ActorType,
  AuthMessage,
  ClientType,
  CompressionShape,
  MessageEnvelope,
  MessagePayloadMap,
  MessageType,
  UsageShape,
} from '../../../../libs/protocol/src';

export interface ConnectedClient {
  connectionId: string;
  socket: WebSocketLike;
  roomId: string;
  agentName: string;
  agentRole: string;
  clientType: ClientType;
  actorType: ActorType;
  privileged: boolean;
  authenticatedAt: number;
  lastSeenAt: number;
}

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ServerConfig {
  host: string;
  port: number;
  projectId: string;
  projectName: string;
  dbPath: string;
  operatorToken?: string;
  authTimeoutMs: number;
  heartbeatTimeoutMs: number;
  maxMessagesPerWindow: number;
  messageWindowMs: number;
  environment: 'development' | 'test' | 'production';
}

export interface ConnectionAuditRecord {
  connectionId: string;
  projectId: string;
  roomId?: string;
  clientType: ClientType | 'unknown';
  clientId: string;
  clientName: string;
  authStatus: 'pending' | 'success' | 'failed';
  openedAt: string;
  closedAt?: string;
  closeCode?: number;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PersistencePort {
  migrate(): void;
  ensureChannel(input: {
    channelId: string;
    projectId: string;
    taskId?: string;
    channelType: string;
    name: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }): void;
  recordConnectionOpened(record: ConnectionAuditRecord): void;
  recordConnectionAuth(record: Pick<ConnectionAuditRecord, 'connectionId' | 'authStatus' | 'clientType' | 'clientId' | 'clientName' | 'roomId' | 'lastSeenAt'>): void;
  recordConnectionClosed(record: Pick<ConnectionAuditRecord, 'connectionId' | 'closedAt' | 'closeCode' | 'lastSeenAt'>): void;
  recordMessage(message: MessageEnvelope): void;
  recordTaskEvent(input: {
    eventId: string;
    projectId: string;
    taskId: string;
    eventType: string;
    actorType: string;
    actorId: string;
    payload?: Record<string, unknown>;
    createdAt: string;
  }): void;
  recordAuditEvent(input: {
    auditEventId: string;
    projectId: string;
    taskId?: string;
    channelId?: string;
    connectionId?: string;
    traceId?: string;
    eventType: string;
    actorType?: string;
    actorId?: string;
    details?: Record<string, unknown>;
    createdAt: string;
  }): void;
  close(): void;
}

export interface AuthResult {
  roomId: string;
  agentName: string;
  agentRole: string;
  clientType: ClientType;
  actorType: ActorType;
  privileged: boolean;
}
