import type WebSocket from 'ws';

export const MESSAGE_TYPES = [
  'auth',
  'status_update',
  'request_help',
  'handoff_event',
  'guardrail_event',
  'trace_event',
  'usage_event',
  'limit_event',
  'checkpoint_event',
  'artifact',
  'proposal',
  'vote',
  'clarification_request',
  'clarification_response',
  'task_created',
  'task_intake_accepted',
  'chat',
  'heartbeat',
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export const ACTOR_TYPES = ['agent', 'orchestrator', 'human', 'system', 'tool'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const CLIENT_TYPES = ['agent', 'orchestrator', 'human', 'dashboard', 'system'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export interface ActorRef {
  actor_type: ActorType;
  actor_id: string;
  actor_name: string;
}

export interface MessageEnvelope<TPayload = Record<string, unknown>> {
  message_id: string;
  project_id: string;
  room_id: string;
  task_id?: string;
  type: Exclude<MessageType, 'auth'>;
  from: ActorRef;
  timestamp: string;
  payload: TPayload;
  reply_to?: string;
  trace_id?: string;
  span_id?: string;
  session_id?: string;
  usage?: UsageShape;
  compression?: CompressionShape;
}

export interface AuthPayload {
  room_id: string;
  agent_name: string;
  agent_role: string;
  client_type?: ClientType;
  token?: string;
}

export interface AuthMessage {
  type: 'auth';
  project_id: string;
  timestamp: string;
  payload: AuthPayload;
}

export interface CompressionShape {
  scheme: string;
  compressed_content: string;
}

export interface UsageShape {
  total_tokens?: number;
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

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
