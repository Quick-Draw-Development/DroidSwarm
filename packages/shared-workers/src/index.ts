import type {
  HandoffPacket,
  SpawnRequest,
  TaskScope,
  TaskStateDigest,
  WorkerEngine,
  WorkerHeartbeat,
  WorkerResult,
} from '@shared-types';

export interface WorkerRequest {
  runId: string;
  taskId: string;
  attemptId: string;
  role: string;
  instructions: string;
  scope: TaskScope;
  engine: WorkerEngine;
  model?: string;
  skillPacks?: string[];
  readOnly?: boolean;
  context?: {
    parentSummary?: string;
    parentCheckpoint?: string;
    resumePacket?: string;
    taskDigest?: TaskStateDigest;
    handoffPacket?: HandoffPacket;
  };
}

export interface WorkerAdapter {
  readonly engine: WorkerEngine;
  readonly supportsHeartbeats: boolean;
  run(request: WorkerRequest, callbacks?: WorkerAdapterCallbacks): Promise<WorkerResult>;
}

export interface WorkerAdapterCallbacks {
  onHeartbeat?(heartbeat: WorkerHeartbeat): void;
}

export interface LegacyCodexAgentResult {
  status: 'completed' | 'blocked' | 'needs_help';
  summary: string;
  requested_agents: Array<{
    role: string;
    reason: string;
    instructions: string;
  }>;
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
    scheme: 'droidspeak-v1' | 'droidspeak-v2';
    compressed_content: string;
  };
  metrics?: {
    tokens?: number;
    tool_calls?: number;
    tools?: string[];
    duration_ms?: number;
  };
}

export const normalizeLegacyCodexResult = (
  input: LegacyCodexAgentResult,
  engine: WorkerEngine = 'codex-cloud',
  model?: string,
): WorkerResult => ({
  success: input.status === 'completed',
  engine,
  model,
  summary: input.summary,
  timedOut: false,
  durationMs: input.metrics?.duration_ms ?? 0,
  activity: {
    filesRead: [],
    filesChanged: [],
    commandsRun: [],
    toolCalls: (input.metrics?.tools ?? []).map((tool) => ({
      tool,
      summary: 'reported by legacy Codex worker',
    })),
  },
  checkpointDelta: {
    factsAdded: [],
    decisionsAdded: [],
    openQuestions: input.clarification_question ? [input.clarification_question] : [],
    risksFound: input.reason_code ? [input.reason_code] : [],
    nextBestActions: [],
    evidenceRefs: [],
  },
  artifacts: input.artifacts.map((artifact) => ({
    kind: artifact.kind,
    summary: artifact.title,
    content: artifact.content,
  })),
  spawnRequests: input.requested_agents.map((request): SpawnRequest => ({
    role: request.role,
    reason: request.reason,
    instructions: request.instructions,
  })),
  budget: {
    tokensOut: input.metrics?.tokens,
  },
  metadata: {
    legacyStatus: input.status,
    reasonCode: input.reason_code,
    clarificationQuestion: input.clarification_question,
    compression: input.compression,
    docUpdates: input.doc_updates,
    branchActions: input.branch_actions,
    toolCalls: input.metrics?.tool_calls,
  },
});

export const createHeartbeat = (input: {
  runId: string;
  taskId: string;
  attemptId: string;
  engine: WorkerEngine;
  elapsedMs: number;
  status: WorkerHeartbeat['status'];
  lastActivity?: string;
}): WorkerHeartbeat => ({
  runId: input.runId,
  taskId: input.taskId,
  attemptId: input.attemptId,
  engine: input.engine,
  timestamp: new Date().toISOString(),
  elapsedMs: input.elapsedMs,
  status: input.status,
  lastActivity: input.lastActivity,
});
