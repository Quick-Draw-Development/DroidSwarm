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
  reason?: string;
  role?: string;
  readOnly?: boolean;
  complexity?: string;
  confidence?: number;
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
