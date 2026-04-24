export type {
  ActorRef,
  ActorType,
  AuthMessage,
  ClientType,
  EnvelopeVerb,
  MessageEnvelope,
  MessagePayloadMap,
  MessageType,
  ToolRequestPayload,
  ToolResponsePayload,
} from '@protocol';
export type {
  ArtifactMemoryIndexEntry,
  CheckpointDelta,
  CompactVerb,
  DroidspeakV2State,
  EnvelopeV2,
  HandoffPacket,
  GitPolicy,
  ModelTier,
  ProjectCheckpoint,
  ProjectDecision,
  ProjectFact,
  RepoTarget,
  RoutingTelemetry,
  RoutingDecision,
  TaskStateDigest,
  TaskChatMessage,
  TaskScope,
  WorkerArtifact,
  WorkerEngine,
  WorkerHeartbeat,
  WorkerResult,
} from '@shared-types';
export type { LegacyCodexAgentResult } from '@shared-workers';
export type CodexAgentResult = import('@shared-workers').LegacyCodexAgentResult;

export interface OrchestratorConfig {
  environment: 'development' | 'test' | 'production';
  debug?: boolean;
  projectId: string;
  projectName: string;
  projectRoot: string;
  repoId: string;
  defaultBranch: string;
  developBranch: string;
  allowedRepoRoots: string[];
  workspaceRoot: string;
  workerHostEntry?: string;
  operatorToken?: string;
  agentName: string;
  agentRole: string;
  socketUrl: string;
  heartbeatMs: number;
  reconnectMs: number;
  codexBin: string;
  codexCloudModel?: string;
  codexApiBaseUrl?: string;
  codexApiKey?: string;
  codexModel?: string;
  codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  llamaBaseUrl: string;
  llamaModel: string;
  llamaModelPath?: string;
  llamaModelsFile?: string;
  availableLlamaModels?: Array<{
    id: string;
    name: string;
    tags?: string;
    path: string;
    url?: string;
  }>;
  llamaTimeoutMs: number;
  prAutomationEnabled: boolean;
  prRemoteName: string;
  prBaseUrl?: string;
  gitPolicy: import('@shared-types').GitPolicy;
  maxAgentsPerTask: number;
  maxConcurrentAgents: number;
  specDir: string;
  orchestratorRules: string;
  droidspeakRules: string;
  agentRules: string;
  plannerRules: string;
  codingRules: string;
  dbPath: string;
  schedulerMaxTaskDepth: number;
  schedulerMaxFanOut: number;
  schedulerRetryIntervalMs: number;
  maxConcurrentCodeAgents: number;
  sideEffectActionsBeforeReview: number;
  allowedTools: string[];
  modelRouting: ModelRoutingConfig;
  routingPolicy: RoutingPolicyConfig;
  appleIntelligence?: AppleIntelligenceConfig;
  mlx?: MlxConfig;
  budgetMaxConsumed?: number;
  policyDefaults?: TaskPolicy;
  federationEnabled?: boolean;
  federationNodeId?: string;
  federationBusUrl?: string;
  federationAdminUrl?: string;
  federationSigningKeyId?: string;
  federationSigningPrivateKey?: string;
  federationRemoteWorkersFile?: string;
  federationRemoteWorkers?: FederationRemoteWorkerTarget[];
  governanceEnabled?: boolean;
}

export interface FederationRemoteWorkerTarget {
  targetId: string;
  serial: string;
  remoteEntry: string;
  remoteCommand?: string;
  roles?: string[];
  engines?: import('@shared-types').WorkerEngine[];
  modelTier?: import('@shared-types').ModelTier;
  workspaceRoot?: string;
  nodeId?: string;
}

export interface ModelRoutingConfig {
  planning: string;
  verification: string;
  code: string;
  apple: string;
  mlx?: string;
  default: string;
}

export interface AppleIntelligenceConfig {
  enabled: boolean;
  sdkAvailable: boolean;
  preferredByHost?: boolean;
}

export interface MlxConfig {
  enabled: boolean;
  available: boolean;
  baseUrl?: string;
  model: string;
}

export interface RoutingPolicyConfig {
  plannerRoles: string[];
  appleRoles: string[];
  appleTaskHints: string[];
  codeHints: string[];
  cloudEscalationHints: string[];
}

export interface TaskRecord {
  taskId: string;
  projectId?: string;
  repoId?: string;
  rootPath?: string;
  workspaceId?: string;
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
  maxParallelHelpers?: number;
  maxSameRoleHelpers?: number;
  localQueueTolerance?: number;
  cloudEscalationAllowed?: boolean;
  priorityBias?: 'time' | 'cost' | 'balanced';
}

export interface SwarmTopologySnapshot {
  runId: string;
  capturedAt: string;
  activeRoles: Array<{
    role: string;
    count: number;
  }>;
  helpers: Array<{
    attemptId: string;
    taskId: string;
    taskName: string;
    parentTaskId?: string;
    role: string;
    agentName: string;
    status: TaskAttemptRecord['status'];
    taskStatus: PersistedTask['status'];
    modelTier?: string;
    routeKind?: string;
    queueDepth?: number;
    fallbackCount?: number;
  }>;
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

export interface SpawnedAgent {
  agentName: string;
  taskId: string;
  role: string;
  attemptId: string;
  executionTarget?: {
    mode: 'local' | 'federated-adb';
    targetId?: string;
    serial?: string;
    nodeId?: string;
  };
}

export interface RunRecord {
  runId: string;
  projectId: string;
  repoId?: string;
  rootPath?: string;
  branch?: string;
  workspaceId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionEventRecord {
  eventId: string;
  runId: string;
  taskId?: string;
  eventType:
    | 'run_started'
    | 'run_completed'
    | 'run_failed'
    | 'run_cancelled'
    | 'run_recovered'
    | 'run_interrupted'
    | 'spawn_requested'
    | 'artifact_created'
    | 'tool_request'
    | 'tool_response'
    | 'clarification_requested'
    | 'checkpoint_created'
    | 'verification_requested'
    | 'verification_completed'
    | 'agent_result'
    | 'plan_proposed'
    | 'verification_fix_task_created'
    | 'handoff_ready'
    | 'memory_pinned';
  detail: string;
  normalizedVerb?: import('@shared-types').CompactVerb;
  transportBody?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PersistedTask {
  taskId: string;
  runId: string;
  projectId?: string;
  repoId?: string;
  rootPath?: string;
  branch?: string;
  workspaceId?: string;
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
  projectId?: string;
  repoId?: string;
  rootPath?: string;
  branch?: string;
  workspaceId?: string;
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
  projectId?: string;
  repoId?: string;
  rootPath?: string;
  branch?: string;
  workspaceId?: string;
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
  projectId?: string;
  repoId?: string;
  rootPath?: string;
  branch?: string;
  workspaceId?: string;
  attemptId?: string;
  payloadJson: string;
  createdAt: string;
}

export interface CheckpointVectorRecord {
  checkpointId: string;
  taskId: string;
  runId: string;
  summary?: string;
  content?: string;
  embedding: number[];
  createdAt: string;
  score?: number;
}

export interface BudgetEventRecord {
  eventId: string;
  runId: string;
  projectId?: string;
  repoId?: string;
  rootPath?: string;
  branch?: string;
  workspaceId?: string;
  taskId?: string;
  detail: string;
  consumed: number;
  createdAt: string;
}

export interface WorkerResultRecord {
  workerResultId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  projectId: string;
  repoId: string;
  rootPath: string;
  branch: string;
  workspaceId?: string;
  engine: string;
  model?: string;
  modelTier?: string;
  queueDepth?: number;
  fallbackCount?: number;
  success: boolean;
  summary: string;
  payloadJson: string;
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

export interface TaskContext {
  sessionId: string;
  description: string;
}

export interface ToolInvocation {
  name: string;
  payload: Record<string, unknown>;
}

export interface AgentAdapter {
  executeTask(taskContext: TaskContext, invocation: ToolInvocation): Promise<unknown>;
  canHandle(taskContext: TaskContext): boolean;
}
