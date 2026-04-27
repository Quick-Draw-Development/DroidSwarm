import { z } from 'zod';

export const WORKER_ENGINES = ['local-llama', 'mlx', 'apple-intelligence', 'codex-cloud', 'codex-cli'] as const;
export type WorkerEngine = (typeof WORKER_ENGINES)[number];
export const MODEL_TIERS = ['local-cheap', 'local-capable', 'cloud'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export const COMPACT_VERBS = [
  'task.create',
  'task.accept',
  'task.ready',
  'task.blocked',
  'plan.proposed',
  'spawn.requested',
  'spawn.approved',
  'spawn.denied',
  'artifact.created',
  'checkpoint.created',
  'verification.requested',
  'verification.completed',
  'run.completed',
  'handoff.ready',
  'consensus.round',
  'summary.emitted',
  'memory.pinned',
  'drift.detected',
  'status.updated',
  'tool.request',
  'tool.response',
  'chat.message',
  'heartbeat',
] as const;
export type CompactVerb = (typeof COMPACT_VERBS)[number];
export const ROUTE_KINDS = [
  'default-local',
  'default-local-saturated',
  'planner-local',
  'planner-local-saturated',
  'apple-local',
  'apple-local-saturated',
  'coder-local',
  'coder-local-queued',
  'cloud-escalated',
  'cloud-escalated-from-local-saturation',
] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export interface EnvelopeRisk {
  level?: 'low' | 'medium' | 'high';
  code?: string;
  summary?: string;
}

export interface RoutingTelemetry {
  modelTier: ModelTier;
  routeKind: RouteKind;
  queueDepth: number;
  fallbackCount: number;
  localFirst: boolean;
  cloudEscalated: boolean;
  escalationReason?: string;
}

export interface EnvelopeV2 {
  id: string;
  ts: string;
  project_id: string;
  swarm_id?: string;
  run_id?: string;
  task_id?: string;
  room_id: string;
  agent_id?: string;
  role?: string;
  verb: CompactVerb;
  depends_on?: string[];
  artifact_refs?: string[];
  memory_refs?: string[];
  risk?: EnvelopeRisk;
  audit_hash?: string;
  consensus?: {
    consensus_id: string;
    proposal_id: string;
    approved: boolean;
    guardian_veto?: boolean;
    audit_hash?: string;
  };
  body: Record<string, unknown>;
}

export const COMPACT_VERB_DICTIONARY: Record<CompactVerb, string> = {
  'task.create': 'Task creation accepted into the execution model.',
  'task.accept': 'Task intake acknowledged by the orchestrator.',
  'task.ready': 'Task is ready for a worker or helper.',
  'task.blocked': 'Task is blocked and needs dependency, policy, or human action.',
  'plan.proposed': 'A concrete plan update was proposed.',
  'spawn.requested': 'A helper spawn was requested.',
  'spawn.approved': 'A helper spawn was approved.',
  'spawn.denied': 'A helper spawn was denied.',
  'artifact.created': 'An artifact was created.',
  'checkpoint.created': 'A checkpoint was created.',
  'verification.requested': 'Verification was requested.',
  'verification.completed': 'Verification completed.',
  'run.completed': 'Run reached a terminal state.',
  'handoff.ready': 'A helper handoff is ready.',
  'consensus.round': 'A governance consensus round was recorded.',
  'summary.emitted': 'A summary update was emitted.',
  'memory.pinned': 'Durable memory or digest state was pinned.',
  'drift.detected': 'A federation drift or continuity mismatch was detected.',
  'status.updated': 'A status update was emitted.',
  'tool.request': 'A tool request was emitted.',
  'tool.response': 'A tool response was emitted.',
  'chat.message': 'A chat message was emitted.',
  heartbeat: 'A heartbeat was emitted.',
};

const compactVerbSchema = z.enum(COMPACT_VERBS);
const modelTierSchema = z.enum(MODEL_TIERS);
const routeKindSchema = z.enum(ROUTE_KINDS);
const envelopeRiskSchema: z.ZodType<EnvelopeRisk> = z.object({
  level: z.enum(['low', 'medium', 'high']).optional(),
  code: z.string().optional(),
  summary: z.string().optional(),
}).strict();
export const routingTelemetrySchema: z.ZodType<RoutingTelemetry> = z.object({
  modelTier: modelTierSchema,
  routeKind: routeKindSchema,
  queueDepth: z.number().int().nonnegative(),
  fallbackCount: z.number().int().nonnegative(),
  localFirst: z.boolean(),
  cloudEscalated: z.boolean(),
  escalationReason: z.string().optional(),
}).strict();
export const droidspeakV2StateSchema = z.object({
  compact: z.string().min(1),
  expanded: z.string().min(1),
  kind: z.enum([
    'plan_status',
    'blocked',
    'unblocked',
    'handoff_ready',
    'verification_needed',
    'summary_emitted',
    'memory_pinned',
  ] as const),
});
export const normalizeDroidspeakV2State = (input: unknown): DroidspeakV2State =>
  droidspeakV2StateSchema.parse(input);
export const isDroidspeakV2State = (input: unknown): boolean =>
  droidspeakV2StateSchema.safeParse(input).success;
export const taskStateDigestSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  projectId: z.string().min(1),
  objective: z.string().min(1),
  currentPlan: z.array(z.string()),
  decisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  activeRisks: z.array(z.string()),
  artifactIndex: z.array(z.object({
    artifactId: z.string().min(1),
    kind: z.string().min(1),
    summary: z.string().min(1),
    reasonRelevant: z.string().min(1).optional(),
    trustConfidence: z.number().min(0).max(1).optional(),
    sourceTaskId: z.string().min(1).optional(),
    supersededBy: z.string().min(1).optional(),
  })),
  verificationState: z.string().min(1),
  lastUpdatedBy: z.string().min(1),
  ts: z.string().datetime(),
  droidspeak: droidspeakV2StateSchema.optional(),
});
export const handoffPacketSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  projectId: z.string().min(1),
  fromTaskId: z.string().min(1),
  toTaskId: z.string().optional(),
  toRole: z.string().min(1),
  digestId: z.string().min(1),
  requiredReads: z.array(z.string()),
  summary: z.string().min(1),
  ts: z.string().datetime(),
  droidspeak: droidspeakV2StateSchema.optional(),
});
export const envelopeV2Schema: z.ZodType<EnvelopeV2> = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  project_id: z.string().min(1),
  swarm_id: z.string().optional(),
  run_id: z.string().optional(),
  task_id: z.string().optional(),
  room_id: z.string().min(1),
  agent_id: z.string().optional(),
  role: z.string().optional(),
  verb: compactVerbSchema,
  depends_on: z.array(z.string()).optional(),
  artifact_refs: z.array(z.string()).optional(),
  memory_refs: z.array(z.string()).optional(),
  risk: envelopeRiskSchema.optional(),
  audit_hash: z.string().min(1).optional(),
  consensus: z.object({
    consensus_id: z.string().min(1),
    proposal_id: z.string().min(1),
    approved: z.boolean(),
    guardian_veto: z.boolean().optional(),
    audit_hash: z.string().min(1).optional(),
  }).optional(),
  body: z.record(z.string(), z.unknown()),
}).strict();

const legacyVerbByType: Record<string, CompactVerb> = {
  status_update: 'status.updated',
  task_created: 'task.create',
  task_intake_accepted: 'task.accept',
  task_ready: 'task.ready',
  chat: 'chat.message',
  heartbeat: 'heartbeat',
  request_help: 'spawn.requested',
  artifact: 'artifact.created',
  artifact_created: 'artifact.created',
  clarification_request: 'task.blocked',
  plan_proposed: 'plan.proposed',
  task_decomposed: 'plan.proposed',
  task_assigned: 'task.ready',
  spawn_requested: 'spawn.requested',
  spawn_approved: 'spawn.approved',
  spawn_denied: 'spawn.denied',
  verification_requested: 'verification.requested',
  verification_completed: 'verification.completed',
  checkpoint_created: 'checkpoint.created',
  run_completed: 'run.completed',
  handoff_event: 'handoff.ready',
  guardrail_event: 'summary.emitted',
  trace_event: 'summary.emitted',
  limit_event: 'task.blocked',
  checkpoint_event: 'memory.pinned',
  tool_request: 'tool.request',
  tool_response: 'tool.response',
};

const compactVerbSet = new Set<string>(COMPACT_VERBS);

const asRecord = (input: unknown): Record<string, unknown> =>
  typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : undefined;

const asIsoTimestamp = (value: unknown): string | undefined => {
  const raw = asString(value);
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const inferCompactVerb = (input: Record<string, unknown>, payload: Record<string, unknown>): CompactVerb => {
  const explicitVerb = asString(input.verb);
  if (explicitVerb && compactVerbSet.has(explicitVerb)) {
    return explicitVerb as CompactVerb;
  }

  const type = asString(input.type) ?? asString(input.event_type) ?? asString(payload.event_type);
  if (type && legacyVerbByType[type]) {
    return legacyVerbByType[type];
  }

  const statusCode = asString(payload.status_code);
  if (statusCode === 'agent_blocked') {
    return 'task.blocked';
  }
  if (statusCode === 'agent_completed') {
    return 'summary.emitted';
  }
  return 'status.updated';
};

const inferArtifactRefs = (input: Record<string, unknown>, payload: Record<string, unknown>): string[] | undefined =>
  asStringArray(input.artifact_refs)
  ?? (asString(payload.artifact_id) ? [asString(payload.artifact_id) as string] : undefined)
  ?? (Array.isArray(payload.artifacts)
    ? payload.artifacts.flatMap((artifact) => {
      const record = asRecord(artifact);
      const artifactId = asString(record.artifactId) ?? asString(record.artifact_id) ?? asString(record.id);
      return artifactId ? [artifactId] : [];
    })
    : undefined);

const inferMemoryRefs = (input: Record<string, unknown>, payload: Record<string, unknown>): string[] | undefined =>
  asStringArray(input.memory_refs)
  ?? (asString(payload.checkpoint_id) ? [asString(payload.checkpoint_id) as string] : undefined)
  ?? (asString(payload.digestId) ? [asString(payload.digestId) as string] : undefined);

const inferRisk = (input: Record<string, unknown>, payload: Record<string, unknown>): EnvelopeRisk | undefined => {
  const risk = asRecord(input.risk);
  if (Object.keys(risk).length > 0) {
    return envelopeRiskSchema.parse(risk);
  }

  const level = asString(payload.risk_level);
  const code = asString(payload.reason_code);
  const summary = asString(payload.content) ?? asString(payload.summary) ?? asString(payload.detail);
  if (!level && !code && !summary) {
    return undefined;
  }

  return envelopeRiskSchema.parse({
    level: level === 'low' || level === 'medium' || level === 'high' ? level : undefined,
    code,
    summary,
  });
};

const syntheticEnvelopeId = (): string =>
  `env-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const normalizeToEnvelopeV2 = (input: unknown): EnvelopeV2 => {
  const record = asRecord(input);
  const payload = asRecord(record.payload);
  const from = asRecord(record.from);
  const body = asRecord(record.body);
  const normalizedBody = Object.keys(body).length > 0 ? body : payload;
  if (typeof normalizedBody.droidspeak === 'object' && normalizedBody.droidspeak !== null) {
    normalizedBody.droidspeak = normalizeDroidspeakV2State(normalizedBody.droidspeak);
  }
  const taskId = asString(record.task_id) ?? asString(payload.task_id);

  return envelopeV2Schema.parse({
    id: asString(record.id) ?? asString(record.message_id) ?? asString(record.event_id) ?? syntheticEnvelopeId(),
    ts: asIsoTimestamp(record.ts) ?? asIsoTimestamp(record.timestamp) ?? asIsoTimestamp(record.created_at) ?? new Date().toISOString(),
    project_id: asString(record.project_id) ?? asString(record.projectId) ?? asString(payload.project_id) ?? asString(payload.projectId) ?? 'droidswarm',
    swarm_id: asString(record.swarm_id),
    run_id: asString(record.run_id) ?? asString(payload.run_id) ?? asString(record.trace_id),
    task_id: taskId,
    room_id: asString(record.room_id) ?? asString(payload.room_id) ?? taskId ?? 'operator',
    agent_id: asString(record.agent_id) ?? asString(from.actor_id) ?? asString(payload.agent_id),
    role: asString(record.role) ?? asString(from.actor_name) ?? asString(payload.agent_role),
    verb: inferCompactVerb(record, payload),
    depends_on: asStringArray(record.depends_on) ?? asStringArray(payload.dependencies),
    artifact_refs: inferArtifactRefs(record, payload),
    memory_refs: inferMemoryRefs(record, payload),
    risk: inferRisk(record, payload),
    audit_hash: asString(record.audit_hash) ?? asString(payload.audit_hash),
    body: normalizedBody,
  });
};

export const isEnvelopeV2 = (input: unknown): boolean => envelopeV2Schema.safeParse(input).success;

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
  modelTier?: ModelTier;
  queueDepth?: number;
  fallbackCount?: number;
  timestamp: string;
  elapsedMs: number;
  status: 'starting' | 'running' | 'waiting' | 'finishing';
  lastActivity?: string;
}

export interface DroidspeakV2State {
  compact: string;
  expanded: string;
  kind:
    | 'plan_status'
    | 'blocked'
    | 'unblocked'
    | 'handoff_ready'
    | 'verification_needed'
    | 'summary_emitted'
    | 'memory_pinned';
}

export interface TaskStateDigest {
  id: string;
  taskId: string;
  runId: string;
  projectId: string;
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
  ts: string;
  federationHash?: string;
  auditHash?: string;
  droidspeak?: DroidspeakV2State;
}

export interface ArtifactMemoryIndexEntry {
  id: string;
  taskId: string;
  runId: string;
  projectId: string;
  artifactId: string;
  kind: string;
  shortSummary: string;
  reasonRelevant: string;
  trustConfidence: number;
  sourceTaskId: string;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HandoffPacket {
  id: string;
  taskId: string;
  runId: string;
  projectId: string;
  fromTaskId: string;
  toTaskId?: string;
  toRole: string;
  digestId: string;
  requiredReads: string[];
  summary: string;
  ts: string;
  federationHash?: string;
  auditHash?: string;
  droidspeak?: DroidspeakV2State;
}

export interface RoutingDecision {
  engine: WorkerEngine;
  model?: string;
  modelTier?: ModelTier;
  routeKind?: RouteKind;
  escalationReason?: string;
  reason: string;
  role: string;
  readOnly: boolean;
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
  skillPacks?: string[];
  queueDepth?: number;
  fallbackCount?: number;
  localFirst?: boolean;
  cloudEscalated?: boolean;
}

export interface TaskChatMessage {
  id: string;
  taskId: string;
  runId: string;
  projectId: string;
  source: 'dashboard' | 'agent' | 'system';
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
  modelTier: modelTierSchema.optional(),
  queueDepth: z.number().int().nonnegative().optional(),
  fallbackCount: z.number().int().nonnegative().optional(),
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
