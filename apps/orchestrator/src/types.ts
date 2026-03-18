export type {
  ActorRef,
  ActorType,
  AuthMessage,
  ClientType,
  MessageEnvelope,
  MessagePayloadMap,
  MessageType,
} from '../../../libs/protocol/src';

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
  dbPath: string;
  schedulerMaxTaskDepth: number;
  schedulerMaxFanOut: number;
  schedulerRetryIntervalMs: number;
  maxConcurrentCodeAgents: number;
  sideEffectActionsBeforeReview: number;
  allowedTools: string[];
  policyDefaults?: TaskPolicy;
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

export interface TaskPolicy {
  maxDepth?: number;
  maxChildren?: number;
  maxTokens?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  approvalPolicy?: 'auto' | 'manual';
}

export interface WorkerState {
  task: TaskRecord;
  activeAgents: string[];
  lastUpdated: string;
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
  metrics?: {
    tokens?: number;
    tool_calls?: number;
    tools?: string[];
    duration_ms?: number;
  };
}

export interface SpawnedAgent {
  agentName: string;
  taskId: string;
  role: string;
  attemptId: string;
}

export interface RunRecord {
  runId: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionEventRecord {
  eventId: string;
  runId: string;
  eventType:
    | 'run_started'
    | 'run_completed'
    | 'run_failed'
    | 'run_cancelled'
    | 'run_recovered'
    | 'run_interrupted'
    | 'spawn_requested'
    | 'artifact_created'
    | 'clarification_requested'
    | 'checkpoint_created'
    | 'verification_requested'
    | 'agent_result'
    | 'plan_proposed';
  detail: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PersistedTask {
  taskId: string;
  runId: string;
  parentTaskId?: string;
  name: string;
  status:
    | 'queued'
    | 'planning'
    | 'running'
    | 'waiting_on_dependency'
    | 'waiting_on_human'
    | 'in_review'
    | 'verified'
    | 'completed'
    | 'failed'
    | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TaskAttemptRecord {
  attemptId: string;
  taskId: string;
  runId: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactRecord {
  artifactId: string;
  attemptId: string;
  taskId: string;
  runId: string;
  kind: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentAssignmentRecord {
  assignmentId: string;
  attemptId: string;
  agentName: string;
  assignedAt: string;
}

export interface CheckpointRecord {
  checkpointId: string;
  taskId: string;
  runId: string;
  attemptId?: string;
  payloadJson: string;
  createdAt: string;
}

export interface BudgetEventRecord {
  eventId: string;
  runId: string;
  taskId?: string;
  detail: string;
  consumed: number;
  createdAt: string;
}

export interface TaskDependencyRecord {
  dependencyId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface VerificationOutcomeRecord {
  reviewId: string;
  runId: string;
  taskId: string;
  attemptId?: string;
  stage: 'verification' | 'review';
  status: 'passed' | 'failed' | 'blocked';
  summary?: string;
  details?: string;
  reviewer?: string;
  createdAt: string;
}

export interface OperatorControlActionRecord {
  actionId: string;
  runId: string;
  taskId?: string;
  actionType: 'cancel_task' | 'request_review' | 'reprioritize' | 'invalid_command';
  detail: string;
  metadataJson?: string;
  createdAt: string;
}
