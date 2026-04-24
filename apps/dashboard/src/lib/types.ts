import type { DroidspeakV2State } from '@shared-types';

export const BOARD_STATUSES = ['todo', 'planning', 'in_progress', 'review', 'done', 'cancelled'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export interface TaskRecord {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  taskType: 'feature' | 'bug' | 'hotfix' | 'task';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: BoardStatus;
  branchType?: string;
  branchName?: string;
  createdByUserId: string;
  createdByDisplayName: string;
  needsClarification: boolean;
  blockedReason?: string;
  stage?: string;
  updatedAt: string;
  agentCount: number;
}

export interface MessageRecord {
  messageId: string;
  projectId: string;
  channelId: string;
  taskId?: string;
  messageType: string;
  senderType: string;
  senderName: string;
  content: string;
  payload: Record<string, unknown>;
  createdAt: string;
  mentionTarget?: string;
}

export interface TaskDetails {
  task: TaskRecord;
  messages: MessageRecord[];
  activeAgents: Array<{
    name: string;
    role: string;
    lastSeenAt: string;
  }>;
  handoffs: string[];
  handoffSource: 'canonical' | 'inferred' | 'missing';
  latestDigest?: {
    id: string;
    objective: string;
    currentPlan: string[];
    decisions: string[];
    openQuestions: string[];
    activeRisks: string[];
    artifactIndex: Array<{
      artifactId: string;
      kind: string;
      summary: string;
      reasonRelevant?: string;
      trustConfidence?: number;
      sourceTaskId?: string;
      supersededBy?: string;
    }>;
    verificationState: string;
    lastUpdatedBy: string;
    updatedAt: string;
    droidspeak?: DroidspeakV2State;
  };
  latestHandoff?: {
    id: string;
    summary: string;
    toRole: string;
    requiredReads: string[];
    digestId: string;
    createdAt: string;
    droidspeak?: DroidspeakV2State;
  };
  latestRoutingTelemetry?: {
    modelTier?: string;
    queueDepth?: number;
    fallbackCount?: number;
    routeKind?: string;
    escalationReason?: string;
  };
  bestCurrentUnderstanding?: {
    objective: string;
    plan: string[];
    blockers: string[];
    keyFindings: string[];
    artifacts: Array<{
      artifactId: string;
      summary: string;
      reasonRelevant?: string;
    }>;
    verificationStatus: string;
    latestHandoffSummary?: string;
  };
  guardrails: string[];
  limits: string[];
}

export interface RunSummary {
  runId: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskNode {
  taskId: string;
  name: string;
  status: string;
  priority: string;
  parentTaskId?: string;
  stage?: string;
  updatedAt: string;
}

export interface RunTimelineEntry {
  eventId: string;
  taskId?: string;
  taskName?: string;
  eventType: string;
  detail: string;
  actorType: string;
  actorId: string;
  createdAt: string;
}

export interface ArtifactSummary {
  artifactId: string;
  taskId: string;
  kind: string;
  summary: string;
  createdAt: string;
}

export interface CheckpointSummary {
  checkpointId: string;
  taskId: string;
  summary?: string;
  createdAt: string;
}

export interface BudgetEventSummary {
  eventId: string;
  taskId?: string;
  detail: string;
  consumed: number;
  createdAt: string;
}

export interface AgentAssignmentSummary {
  agentName: string;
  role?: string;
  taskId: string;
  taskName?: string;
  assignedAt: string;
}

export interface VerificationTaskSummary {
  taskId: string;
  name: string;
  stage: string;
  status: string;
  parentTaskId?: string;
  updatedAt: string;
}

export interface DependencySummary {
  dependencyId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface OrchestrationInsightsData {
  runs: RunSummary[];
  tasks: TaskNode[];
  artifacts: ArtifactSummary[];
  checkpoints: CheckpointSummary[];
  budgets: BudgetEventSummary[];
  assignments: AgentAssignmentSummary[];
  verifications: VerificationTaskSummary[];
  dependencies: DependencySummary[];
  timeline: RunTimelineEntry[];
  routingTelemetry?: RunRoutingTelemetrySummary;
  allocatorPolicy?: RunAllocatorPolicySummary;
  topology?: SwarmTopologySummary;
  serviceUsage?: RunServiceUsageSummary;
  federation?: FederationStatusSummary;
  auditTrail?: AuditTrailSummary;
  governance?: GovernanceSummary;
}

export interface GovernanceSummary {
  lawHash: string;
  activeLawCount: number;
  pendingProposalCount: number;
  approvedProposalCount: number;
  latestDebateAt?: string;
  laws: Array<{
    id: string;
    title: string;
    description: string;
    version: string;
  }>;
  proposals: Array<{
    proposalId: string;
    lawId: string;
    title: string;
    status: string;
    proposedBy: string;
    updatedAt: string;
  }>;
}

export interface AuditTrailSummary {
  merkleRoot: string;
  chainVerified: boolean;
  latestEvents: Array<{
    id: number;
    ts: string;
    eventType: string;
    nodeId: string;
    taskId?: string;
    runId?: string;
    detail: string;
    hash: string;
  }>;
}
export interface ProjectIdentity {
  projectId: string;
  projectName: string;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export interface RepoSummary {
  repoId: string;
  projectId: string;
  name: string;
  rootPath: string;
  defaultBranch: string;
}

export interface WorkerHeartbeatSummary {
  attemptId: string;
  engine: string;
  modelTier?: string;
  queueDepth?: number;
  fallbackCount?: number;
  status: string;
  elapsedMs: number;
  lastActivity?: string;
  createdAt: string;
}

export interface RoutingDecisionSummary {
  attemptId: string;
  engine?: string;
  model?: string;
  modelTier?: string;
  queueDepth?: number;
  fallbackCount?: number;
  routeKind?: string;
  escalationReason?: string;
  reason?: string;
  role?: string;
  readOnly?: boolean;
  complexity?: string;
  confidence?: number;
}

export interface RunRoutingTelemetrySummary {
  modelTierCounts: Array<{
    modelTier: string;
    count: number;
  }>;
  averageQueueDepth: number;
  averageFallbackCount: number;
  cloudEscalationCount: number;
  escalationReasons: Array<{
    reason: string;
    count: number;
  }>;
  averageLatencyByRoleAndEngine: Array<{
    role: string;
    engine: string;
    averageElapsedMs: number;
  }>;
}

export interface RunAllocatorPolicySummary {
  maxParallelHelpers?: number;
  maxSameRoleHelpers?: number;
  localQueueTolerance?: number;
  cloudEscalationAllowed?: boolean;
  priorityBias?: 'time' | 'cost' | 'balanced';
}

export interface SwarmTopologySummary {
  capturedAt?: string;
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
    status: string;
    taskStatus: string;
    modelTier?: string;
    routeKind?: string;
    queueDepth?: number;
    fallbackCount?: number;
  }>;
}

export interface RunServiceUsageSummary {
  health?: {
    updatedAt?: string;
    allReady: boolean;
    exportsReady: boolean;
    llama: {
      status: string;
      reachable: boolean;
      url?: string;
      model?: string;
      modelPresent: boolean;
      inventoryPresent: boolean;
      inventoryCount: number;
      inventoryHasSelected: boolean;
    };
  };
  llama: {
    requestCount: number;
    failureCount: number;
    averageLatencyMs: number;
    localRoleCoverage: Array<{
      role: string;
      count: number;
    }>;
    localCoveragePercent: number;
    cloudBypassRatePercent: number;
    bypassReasons: Array<{
      reason: string;
      count: number;
    }>;
    meetsLocalCoverageTarget: boolean;
    meetsCloudEscalationTarget: boolean;
  };
  policy: {
    status: 'healthy' | 'warning' | 'action-needed';
    summary: string;
    actions: string[];
  };
}

export interface FederationPeerSummary {
  peerId: string;
  busUrl: string;
  adminUrl?: string;
  capabilities: string[];
  lastHeartbeatAt?: string;
  lastKickAt?: string;
}

export interface FederationStatusSummary {
  enabled: boolean;
  state: string;
  nodeId?: string;
  host?: string;
  busPort?: number;
  adminPort?: number;
  busUrl?: string;
  adminUrl?: string;
  peerCount?: number;
  recentEventCount?: number;
  peers: FederationPeerSummary[];
  updatedAt?: string;
}

export interface ProjectMemorySummary {
  facts: Array<{
    id: string;
    statement: string;
    confidence: number;
    status: string;
    createdAt: string;
  }>;
  decisions: Array<{
    id: string;
    summary: string;
    why: string;
    createdAt: string;
  }>;
  checkpoints: Array<{
    id: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface TaskChatSummary {
  id: string;
  taskId: string;
  source: string;
  authorType: string;
  authorId: string;
  body: string;
  createdAt: string;
}
