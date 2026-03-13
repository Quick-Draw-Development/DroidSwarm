export type ActorType = 'agent' | 'orchestrator' | 'human' | 'system' | 'tool';
export type ClientType = 'agent' | 'orchestrator' | 'human' | 'dashboard' | 'system';
export type MessageType =
  | 'auth'
  | 'status_update'
  | 'request_help'
  | 'artifact'
  | 'clarification_request'
  | 'task_created'
  | 'task_intake_accepted'
  | 'chat'
  | 'heartbeat';

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
  compression?: string;
}

export interface AuthMessage {
  type: 'auth';
  project_id: string;
  timestamp: string;
  payload: {
    room_id: string;
    agent_name: string;
    agent_role: string;
    client_type: ClientType;
    token?: string;
  };
}

export interface OrchestratorConfig {
  environment: 'development' | 'test' | 'production';
  projectId: string;
  projectName: string;
  projectRoot: string;
  operatorToken?: string;
  agentName: string;
  agentRole: string;
  socketUrl: string;
  heartbeatMs: number;
  reconnectMs: number;
  codexBin: string;
  codexModel?: string;
  codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  maxAgentsPerTask: number;
  maxConcurrentAgents: number;
  specDir: string;
  orchestratorRules: string;
  droidspeakRules: string;
  agentRules: string;
}

export interface TaskRecord {
  taskId: string;
  title: string;
  description: string;
  taskType: string;
  priority: string;
  createdByUserId?: string;
  createdAt: string;
  branchName?: string;
}

export interface TaskState {
  task: TaskRecord;
  status: 'pending' | 'cancelled';
  activeAgents: string[];
  updatedAt: string;
}

export interface RequestedAgent {
  role: string;
  reason: string;
  instructions: string;
}

export interface CodexAgentResult {
  status: 'completed' | 'blocked' | 'needs_help';
  summary: string;
  requested_agents: RequestedAgent[];
  artifacts: Array<{
    kind: string;
    title: string;
    content: string;
  }>;
  doc_updates: string[];
  branch_actions: string[];
  clarification_question?: string;
  reason_code?: string;
  compression?: {
    scheme: 'droidspeak-v1';
    compressed_content: string;
  };
}

export interface SpawnedAgent {
  agentName: string;
  taskId: string;
  role: string;
}
