import { z } from 'zod';

export const WORKER_ENGINES = ['local-llama', 'codex-cloud', 'codex-cli', 'mux-local', 'blink-agent'] as const;
export type WorkerEngine = (typeof WORKER_ENGINES)[number];

export interface TaskScope {
  projectId: string;
  repoId: string;
  rootPath: string;
  branch: string;
  workspaceId?: string;
}

export interface RepoTarget extends TaskScope {
  id: string;
  repoId: string;
  name: string;
  defaultBranch: string;
  allowedRoots: string[];
  mainBranch: string;
  developBranch: string;
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerActivity {
  filesRead: string[];
  filesChanged: string[];
  commandsRun: string[];
  toolCalls: Array<{ tool: string; summary: string }>;
}

export interface CheckpointDelta {
  factsAdded: string[];
  decisionsAdded: string[];
  openQuestions: string[];
  risksFound: string[];
  nextBestActions: string[];
  evidenceRefs: string[];
}

export interface SpawnRequest {
  role: string;
  reason: string;
  instructions?: string;
  preferredEngine?: WorkerEngine;
  preferredModel?: string;
  skillPacks?: string[];
  readOnly?: boolean;
}

export interface WorkerArtifact {
  kind: string;
  path?: string;
  uri?: string;
  summary: string;
  content?: string;
}

export interface WorkerResult {
  success: boolean;
  engine: WorkerEngine;
  model?: string;
  summary: string;
  timedOut: boolean;
  durationMs: number;
  activity: WorkerActivity;
  checkpointDelta: CheckpointDelta;
  artifacts: WorkerArtifact[];
  spawnRequests: SpawnRequest[];
  budget: {
    tokensIn?: number;
    tokensOut?: number;
    estimatedCostUsd?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface WorkerHeartbeat {
  runId: string;
  taskId: string;
  attemptId: string;
  engine: WorkerEngine;
  timestamp: string;
  elapsedMs: number;
  status: 'starting' | 'running' | 'waiting' | 'finishing';
  lastActivity?: string;
}

export interface RoutingDecision {
  engine: WorkerEngine;
  model?: string;
  reason: string;
  role: string;
  readOnly: boolean;
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
  skillPacks?: string[];
}

export interface TaskChatMessage {
  id: string;
  taskId: string;
  runId: string;
  projectId: string;
  source: 'dashboard' | 'slack' | 'blink' | 'agent' | 'system';
  externalThreadId?: string;
  externalMessageId?: string;
  authorType: 'user' | 'agent' | 'system';
  authorId: string;
  body: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectFact {
  id: string;
  projectId: string;
  repoId: string;
  scope: string;
  statement: string;
  confidence: number;
  evidenceRefs: string[];
  status: 'proposed' | 'confirmed' | 'disputed' | 'superseded';
  createdAt: string;
}

export interface ProjectDecision {
  id: string;
  projectId: string;
  repoId: string;
  summary: string;
  why: string;
  alternativesRejected: string[];
  evidenceRefs: string[];
  createdAt: string;
}

export interface ProjectCheckpoint {
  id: string;
  projectId: string;
  repoId: string;
  runId: string;
  summary: string;
  facts: string[];
  decisions: string[];
  openQuestions: string[];
  componentSummaries: string[];
  createdAt: string;
}

export interface GitPolicy {
  mainBranch: string;
  developBranch: string;
  prefixes: {
    feature: string;
    hotfix: string;
    release: string;
    support: string;
  };
}

export const workerResultSchema = z.object({
  success: z.boolean(),
  engine: z.enum(WORKER_ENGINES),
  model: z.string().optional(),
  summary: z.string(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative(),
  activity: z.object({
    filesRead: z.array(z.string()),
    filesChanged: z.array(z.string()),
    commandsRun: z.array(z.string()),
    toolCalls: z.array(z.object({
      tool: z.string(),
      summary: z.string(),
    })),
  }),
  checkpointDelta: z.object({
    factsAdded: z.array(z.string()),
    decisionsAdded: z.array(z.string()),
    openQuestions: z.array(z.string()),
    risksFound: z.array(z.string()),
    nextBestActions: z.array(z.string()),
    evidenceRefs: z.array(z.string()),
  }),
  artifacts: z.array(z.object({
    kind: z.string(),
    path: z.string().optional(),
    uri: z.string().optional(),
    summary: z.string(),
    content: z.string().optional(),
  })),
  spawnRequests: z.array(z.object({
    role: z.string(),
    reason: z.string(),
    instructions: z.string().optional(),
    preferredEngine: z.enum(WORKER_ENGINES).optional(),
    preferredModel: z.string().optional(),
    skillPacks: z.array(z.string()).optional(),
    readOnly: z.boolean().optional(),
  })),
  budget: z.object({
    tokensIn: z.number().optional(),
    tokensOut: z.number().optional(),
    estimatedCostUsd: z.number().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const workerHeartbeatSchema = z.object({
  runId: z.string(),
  taskId: z.string(),
  attemptId: z.string(),
  engine: z.enum(WORKER_ENGINES),
  timestamp: z.string(),
  elapsedMs: z.number().nonnegative(),
  status: z.enum(['starting', 'running', 'waiting', 'finishing']),
  lastActivity: z.string().optional(),
});

export const taskScopeSchema = z.object({
  projectId: z.string().min(1),
  repoId: z.string().min(1),
  rootPath: z.string().min(1),
  branch: z.string().min(1),
  workspaceId: z.string().optional(),
});
