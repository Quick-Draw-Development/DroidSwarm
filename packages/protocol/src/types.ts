export type ActorType = 'agent' | 'orchestrator' | 'human' | 'system' | 'tool';
export type ClientType = 'agent' | 'orchestrator' | 'human' | 'dashboard' | 'system';

export interface ActorRef {
  actor_type: ActorType;
  actor_id: string;
  actor_name: string;
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

export interface StatusUpdatePayload {
  phase: string;
  status_code: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface TaskCreatedPayload {
  task_id: string;
  title?: string;
  description?: string;
  task_type?: string;
  priority?: string;
  created_by?: string;
  created_by_user_id?: string;
  branch_name?: string;
}

export interface TaskIntakeAcceptedPayload {
  task_id: string;
  accepted: boolean;
  next_status?: string;
  content?: string;
}

export interface ChatPayload {
  content: string;
}

export interface HeartbeatPayload {}

export interface RequestHelpPayload {
  task_id?: string;
  needed_role: string;
  reason_code: string;
  instructions: string;
  content: string;
}

export interface ArtifactPayload {
  artifact_kind: string;
  title: string;
  content: string;
}

export interface ArtifactCreatedPayload {
  artifact_id: string;
  task_id: string;
  kind: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ClarificationRequestPayload {
  target_user_id?: string;
  question: string;
  content: string;
  question_id?: string;
  reason_code?: string;
}

export interface PlanProposedPayload {
  task_id: string;
  plan_id: string;
  summary: string;
  plan?: string;
  confidence?: number;
  dependencies?: string[];
}

export interface TaskDecomposedPayload {
  parent_task_id: string;
  child_task_ids: string[];
  summary?: string;
  reason?: string;
}

export interface AssignedAgentShape {
  agent_name: string;
  agent_role: string;
  attempt_id: string;
}

export interface TaskAssignedPayload {
  task_id: string;
  assignment_id: string;
  assigned_agents: AssignedAgentShape[];
}

export interface SpawnRequestedPayload {
  task_id: string;
  needed_role: string;
  reason_code: string;
  instructions: string;
  content: string;
}

export interface SpawnApprovedPayload {
  task_id: string;
  approved_agents: AssignedAgentShape[];
  summary?: string;
}

export interface SpawnDeniedPayload {
  task_id: string;
  reason_code: string;
  details?: string;
}

export interface VerificationRequestedPayload {
  task_id: string;
  verification_type: string;
  requested_by: string;
  detail?: string;
}

export interface VerificationCompletedPayload {
  task_id: string;
  status: 'passed' | 'failed' | 'blocked';
  reviewer: string;
  details?: string;
}

export interface CheckpointCreatedPayload {
  checkpoint_id: string;
  task_id: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface RunCompletedPayload {
  run_id: string;
  status: 'completed' | 'failed' | 'cancelled';
  summary?: string;
}

export interface HandoffEventPayload {
  handoff_id?: string;
  to_actor_type?: string;
  to_actor_id?: string;
  reason_code?: string;
  context_ref?: string;
  expected_outcome?: string;
}

export interface GuardrailEventPayload {
  guardrail_name?: string;
  phase?: string;
  result?: string;
  details?: Record<string, unknown>;
  content?: string;
}

export interface TraceEventPayload {
  trace_id?: string;
  event_name?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface LimitEventPayload {
  limit_event_id?: string;
  limit_type?: string;
  scope_type?: string;
  scope_id?: string;
  status?: string;
  threshold_name?: string;
  current_value?: number;
  threshold_value?: number;
  retry_after_ms?: number;
  degraded_mode?: string;
}

export interface CheckpointEventPayload {
  checkpoint_id?: string;
  session_id?: string;
  checkpoint_type?: string;
  content?: string;
  summary_ref?: string;
}

export type ToolName = 'file_read' | 'file_write' | 'nx_run' | 'web_search' | 'checkpoint_search';

export interface ToolRequestPayload {
  request_id: string;
  tool_name: ToolName;
  parameters?: Record<string, unknown>;
}

export interface ToolResponsePayload {
  request_id: string;
  status: 'success' | 'error';
  result?: Record<string, unknown>;
  error?: string;
}

export interface MessagePayloadMap {
  status_update: StatusUpdatePayload;
  task_created: TaskCreatedPayload;
  task_intake_accepted: TaskIntakeAcceptedPayload;
  chat: ChatPayload;
  heartbeat: HeartbeatPayload;
  request_help: RequestHelpPayload;
  artifact: ArtifactPayload;
  artifact_created: ArtifactCreatedPayload;
  clarification_request: ClarificationRequestPayload;
  plan_proposed: PlanProposedPayload;
  task_decomposed: TaskDecomposedPayload;
  task_assigned: TaskAssignedPayload;
  spawn_requested: SpawnRequestedPayload;
  spawn_approved: SpawnApprovedPayload;
  spawn_denied: SpawnDeniedPayload;
  verification_requested: VerificationRequestedPayload;
  verification_completed: VerificationCompletedPayload;
  checkpoint_created: CheckpointCreatedPayload;
  run_completed: RunCompletedPayload;
  handoff_event: HandoffEventPayload;
  guardrail_event: GuardrailEventPayload;
  trace_event: TraceEventPayload;
  limit_event: LimitEventPayload;
  checkpoint_event: CheckpointEventPayload;
  tool_request: ToolRequestPayload;
  tool_response: ToolResponsePayload;
}

export type MessageType = keyof MessagePayloadMap;

type MessageEnvelopeBase<T extends MessageType> = {
  message_id: string;
  project_id: string;
  room_id: string;
  task_id?: string;
  type: T;
  from: ActorRef;
  timestamp: string;
  payload: MessagePayloadMap[T];
  reply_to?: string;
  trace_id?: string;
  span_id?: string;
  session_id?: string;
  usage?: UsageShape;
  compression?: CompressionShape;
};

export type MessageEnvelope<T extends MessageType = MessageType> = T extends MessageType
  ? MessageEnvelopeBase<T>
  : never;

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
