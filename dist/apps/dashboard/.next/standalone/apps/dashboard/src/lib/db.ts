import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';

import WebSocket from 'ws';
import type Database from 'better-sqlite3';
import type { DroidspeakV2State } from '@shared-types';

import type {
  ArtifactSummary,
  AgentAssignmentSummary,
  AuditTrailSummary,
  BoardStatus,
  BudgetEventSummary,
  CheckpointSummary,
  DependencySummary,
  FederationPeerSummary,
  FederationStatusSummary,
  MessageRecord,
  ProjectIdentity,
  ProjectMemorySummary,
  ProjectSummary,
  RepoSummary,
  RoutingDecisionSummary,
  RunAllocatorPolicySummary,
  RunRoutingTelemetrySummary,
  RunServiceUsageSummary,
  RunSummary,
  SwarmTopologySummary,
  TaskChatSummary,
  RunTimelineEntry,
  TaskDetails,
  TaskNode,
  TaskRecord,
  VerificationTaskSummary,
  WorkerHeartbeatSummary,
} from './types';

const getProjectId = (): string => process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm';
const getProjectName = (): string => process.env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm';
const DEFAULT_DB_PATH = process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db');
const DEFAULT_SOCKET_URL = process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765';
const DEFAULT_ORCHESTRATOR_NAME = process.env.DROIDSWARM_ORCHESTRATOR_NAME ?? 'Orchestrator';
const require = createRequire(import.meta.url);
const DEBUG_LOGGING_ENABLED = /^(1|true|yes|on)$/i.test(process.env.DROIDSWARM_DEBUG ?? '');
const GENESIS_AUDIT_HASH = 'genesis-hash-00000000000000000000000000000000';

const dashboardLog = (event: string, detail?: Record<string, unknown>): void => {
  if (!DEBUG_LOGGING_ENABLED) {
    return;
  }
  if (detail) {
    console.log('[Dashboard]', event, detail);
    return;
  }
  console.log('[Dashboard]', event);
};

type AuditLogRow = {
  id: number;
  ts: string;
  swarm_id: string;
  node_id: string;
  event_type: string;
  payload: Buffer;
  prev_hash: string;
  merkle_leaf: string;
  signature?: string | null;
  height: number;
};

const normalizePem = (value: string): string => value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;

const stableSerialize = (input: unknown): string => {
  if (input == null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};

const inflateAuditPayload = (payload: Buffer): Record<string, unknown> =>
  JSON.parse(gunzipSync(payload).toString('utf8')) as Record<string, unknown>;

const computeAuditLeafHash = (input: {
  ts: string;
  swarmId: string;
  nodeId: string;
  eventType: string;
  payload: Record<string, unknown>;
  prevHash: string;
  height: number;
}): string =>
  createHash('sha256')
    .update([
      input.ts,
      input.swarmId,
      input.nodeId,
      input.eventType,
      stableSerialize(input.payload),
      input.prevHash,
      String(input.height),
    ].join('|'))
    .digest('hex');

const computeAuditMerkleRoot = (leaves: string[]): string => {
  if (leaves.length === 0) {
    return 'empty';
  }

  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(createHash('sha256').update(left + right).digest('hex'));
    }
    level = next;
  }
  return level[0];
};

const resolveAuditPublicKey = (): string | undefined => {
  const envPublicKey = process.env.DROIDSWARM_AUDIT_SIGNING_PUBLIC_KEY;
  if (envPublicKey) {
    return normalizePem(envPublicKey);
  }
  const configuredFile = process.env.DROIDSWARM_AUDIT_SIGNING_KEY_FILE;
  const keyFile = configuredFile ?? path.resolve(path.dirname(DEFAULT_DB_PATH), 'audit-signing-keypair.json');
  if (!fs.existsSync(keyFile)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as { publicKeyPem?: string };
    return typeof raw.publicKeyPem === 'string' ? raw.publicKeyPem : undefined;
  } catch {
    return undefined;
  }
};

const verifyAuditSignature = (hash: string, signature?: string | null): boolean => {
  if (!signature) {
    return true;
  }
  const publicKeyPem = resolveAuditPublicKey();
  if (!publicKeyPem) {
    return false;
  }
  try {
    return verifySignature(
      null,
      Buffer.from(hash, 'utf8'),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
};

const readAuditRows = (database: Database.Database, limit?: number): AuditLogRow[] => {
  const limitClause = typeof limit === 'number' ? 'LIMIT ?' : '';
  const statement = database.prepare(`
    SELECT id, ts, swarm_id, node_id, event_type, payload, prev_hash, merkle_leaf, signature, height
    FROM audit_log
    ORDER BY id DESC
    ${limitClause}
  `);
  const rows = (typeof limit === 'number' ? statement.all(limit) : statement.all()) as AuditLogRow[];
  return rows;
};

type RawTaskRow = {
  task_id: string;
  run_id: string;
  parent_task_id?: string | null;
  name: string;
  status: string;
  priority: string;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
};

type BoardTaskRow = RawTaskRow & {
  agent_count?: number;
};

const fetchTaskRowsForRun = (database: Database.Database, runId: string): BoardTaskRow[] => {
  return database
    .prepare(`
      SELECT
        t.*,
        COUNT(DISTINCT aa.agent_name) AS agent_count
      FROM tasks t
      LEFT JOIN task_attempts ta ON ta.task_id = t.task_id
      LEFT JOIN agent_assignments aa ON aa.attempt_id = ta.attempt_id
      WHERE t.run_id = ?
      GROUP BY t.task_id
      ORDER BY t.updated_at DESC
    `)
    .all(runId) as BoardTaskRow[];
};

const fetchRawTaskRows = (database: Database.Database, runId: string): RawTaskRow[] => {
  return database
    .prepare(`
      SELECT *
      FROM tasks
      WHERE run_id = ?
      ORDER BY updated_at DESC
    `)
    .all(runId) as RawTaskRow[];
};

const countAgentsForTask = (database: Database.Database, taskId: string): number => {
  const row = database
    .prepare(`
      SELECT COUNT(DISTINCT aa.agent_name) as agent_count
      FROM agent_assignments aa
      JOIN task_attempts ta ON ta.attempt_id = aa.attempt_id
      WHERE ta.task_id = ?
    `)
    .get(taskId) as { agent_count?: number } | undefined;
  return typeof row?.agent_count === 'number' ? row.agent_count : 0;
};

let databaseInstance: Database.Database | null = null;
let databaseConstructor: (typeof import('better-sqlite3')) | null = null;

const getDatabaseConstructor = (): typeof import('better-sqlite3') => {
  if (!databaseConstructor) {
    databaseConstructor = require('better-sqlite3') as typeof import('better-sqlite3');
  }

  return databaseConstructor;
};

export const resetDatabaseInstance = (): void => {
  if (databaseInstance) {
    databaseInstance.close();
    databaseInstance = null;
  }
};

const getDatabase = (): Database.Database => {
  if (databaseInstance) {
    return databaseInstance;
  }

  fs.mkdirSync(path.dirname(DEFAULT_DB_PATH), { recursive: true });
  const DatabaseImpl = getDatabaseConstructor();
  databaseInstance = new DatabaseImpl(DEFAULT_DB_PATH);
  ensureDashboardSchema(databaseInstance);
  dashboardLog('database.ready', {
    dbPath: DEFAULT_DB_PATH,
    projectId: getProjectId(),
    socketUrl: DEFAULT_SOCKET_URL,
  });
  return databaseInstance;
};

const ensureDashboardSchema = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      task_id TEXT,
      session_id TEXT,
      trace_id TEXT,
      message_type TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT,
      payload_json TEXT NOT NULL,
      reply_to_message_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_chat_messages (
      message_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_id TEXT,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      external_thread_id TEXT,
      external_message_id TEXT,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const messageColumns = new Set(
    (database.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!messageColumns.has('sender_id')) {
    database.exec(`ALTER TABLE messages ADD COLUMN sender_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!messageColumns.has('session_id')) {
    database.exec(`ALTER TABLE messages ADD COLUMN session_id TEXT`);
  }
  if (!messageColumns.has('trace_id')) {
    database.exec(`ALTER TABLE messages ADD COLUMN trace_id TEXT`);
  }
  if (!messageColumns.has('reply_to_message_id')) {
    database.exec(`ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT`);
  }
};

const mapTaskRecord = (row: Record<string, unknown>): TaskRecord => ({
  taskId: String(row.task_id),
  projectId: String(row.project_id),
  title: String(row.title),
  description: String(row.description),
  taskType: row.task_type as TaskRecord['taskType'],
  priority: row.priority as TaskRecord['priority'],
  status: row.status as TaskRecord['status'],
  branchType: typeof row.branch_type === 'string' ? row.branch_type : undefined,
  branchName: typeof row.branch_name === 'string' ? row.branch_name : undefined,
  createdByUserId: String(row.created_by_user_id),
  createdByDisplayName: String(row.created_by_display_name),
  needsClarification: Number(row.needs_clarification) === 1,
  blockedReason: typeof row.blocked_reason === 'string' ? row.blocked_reason : undefined,
  updatedAt: String(row.updated_at),
  agentCount: 0,
});

const mapMessageRecord = (row: Record<string, unknown>): MessageRecord => ({
  messageId: String(row.message_id),
  projectId: String(row.project_id),
  channelId: String(row.channel_id),
  taskId: typeof row.task_id === 'string' ? row.task_id : undefined,
  messageType: String(row.message_type),
  senderType: String(row.sender_type),
  senderName: String(row.sender_name),
  content: typeof row.content === 'string' ? row.content : '',
  payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) as Record<string, unknown> : {},
  createdAt: String(row.created_at),
});

const parseMetadata = (value?: string | null): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const parsePayload = (value?: string | null): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const parseBooleanFlag = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parsePositiveInt = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const parseNonNegativeInt = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const toStringValue = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;

const getSwarmDirectory = (): string | undefined => {
  const swarmId = process.env.DROIDSWARM_SWARM_ID;
  const droidswarmHome = process.env.DROIDSWARM_HOME ?? path.join(process.env.HOME ?? '', '.droidswarm');
  if (!swarmId || !droidswarmHome) {
    return undefined;
  }

  return path.join(droidswarmHome, 'swarms', swarmId);
};

const getSwarmHealthSnapshotPath = (): string | undefined => {
  const swarmDir = getSwarmDirectory();
  if (!swarmDir) {
    return undefined;
  }

  return path.join(swarmDir, 'service-health.json');
};

const getFederationSnapshotPath = (): string | undefined => {
  const swarmDir = getSwarmDirectory();
  if (!swarmDir) {
    return undefined;
  }

  const candidates = [
    'federation-status.json',
    'federation.json',
    'bus-status.json',
    'status.json',
  ].map((fileName) => path.join(swarmDir, fileName));

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const buildFederationUrl = (host: string | undefined, port?: number): string | undefined => {
  if (!port || port <= 0) {
    return undefined;
  }

  const resolvedHost = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${resolvedHost}:${port}`;
};

const parseFederationPeerRecord = (value: unknown): FederationPeerSummary | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const peerId = toStringValue(record.peerId ?? record.peer_id ?? record.id);
  const busUrl = toStringValue(record.busUrl ?? record.bus_url);
  if (!peerId || !busUrl) {
    return undefined;
  }

  return {
    peerId,
    busUrl,
    adminUrl: toStringValue(record.adminUrl ?? record.admin_url),
    capabilities: Array.isArray(record.capabilities)
      ? record.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : [],
    lastHeartbeatAt: toStringValue(record.lastHeartbeatAt ?? record.last_heartbeat_at),
    lastKickAt: toStringValue(record.lastKickAt ?? record.last_kick_at),
  };
};

const parseFederationPeers = (value?: string): FederationPeerSummary[] => {
  if (!value) {
    return [];
  }

  return value.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry): FederationPeerSummary | undefined => {
      const busUrl = entry.startsWith('http://') || entry.startsWith('https://')
        ? entry.replace(/\/$/, '')
        : `http://${entry.replace(/\/$/, '')}`;
      try {
        const parsed = new URL(busUrl);
        const adminPort = parsed.port ? Number.parseInt(parsed.port, 10) + 3 : 4950;
        return {
          peerId: parsed.host.replace(/[^a-zA-Z0-9_.:-]/g, '-'),
          busUrl,
          adminUrl: `${parsed.protocol}//${parsed.hostname}:${adminPort}`,
          capabilities: [] as string[],
        };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is FederationPeerSummary => entry != null);
};

const getFederationEnvStatus = (): FederationStatusSummary => {
  const enabled = parseBooleanFlag(process.env.DROIDSWARM_ENABLE_FEDERATION, false);
  const nodeId = process.env.DROIDSWARM_FEDERATION_NODE_ID ?? process.env.DROIDSWARM_SWARM_ID;
  const host = process.env.DROIDSWARM_FEDERATION_HOST;
  const busPort = parsePositiveInt(process.env.DROIDSWARM_FEDERATION_BUS_PORT);
  const adminPort = parsePositiveInt(process.env.DROIDSWARM_FEDERATION_ADMIN_PORT);
  const busUrl = process.env.DROIDSWARM_FEDERATION_BUS_URL ?? buildFederationUrl(host, busPort);
  const adminUrl = process.env.DROIDSWARM_FEDERATION_ADMIN_URL ?? buildFederationUrl(host, adminPort);
  const peers = parseFederationPeers(process.env.DROIDSWARM_FEDERATION_PEERS);

  return {
    enabled,
    state: enabled ? (peers.length > 0 ? 'active' : 'enabled') : 'disabled',
    nodeId,
    host,
    busPort,
    adminPort,
    busUrl,
    adminUrl,
    peerCount: peers.length > 0 ? peers.length : undefined,
    peers,
  };
};

const getFederationStatusFromSnapshot = (): FederationStatusSummary | undefined => {
  const snapshotPath = getFederationSnapshotPath();
  if (!snapshotPath) {
    return undefined;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Record<string, unknown>;
    const peers = Array.isArray(raw.peers)
      ? raw.peers.map(parseFederationPeerRecord).filter((entry): entry is FederationPeerSummary => entry != null)
      : [];
    const counters = typeof raw.counters === 'object' && raw.counters !== null
      ? raw.counters as Record<string, unknown>
      : undefined;
    const peerCount = parseNonNegativeInt(raw.peerCount) ?? (peers.length > 0 ? peers.length : 0);
    const recentEventCount = parseNonNegativeInt(raw.recentEventCount);
    const enabled = parseBooleanFlag(raw.enabled, true);
    const explicitState = toStringValue(raw.state ?? raw.status);
    const state = explicitState ?? (enabled ? (peerCount && peerCount > 0 ? 'active' : 'enabled') : 'disabled');

    return {
      enabled,
      state,
      nodeId: toStringValue(raw.nodeId ?? raw.node_id),
      host: toStringValue(raw.host),
      busPort: parsePositiveInt(raw.busPort ?? raw.bus_port),
      adminPort: parsePositiveInt(raw.adminPort ?? raw.admin_port),
      busUrl: toStringValue(raw.busUrl ?? raw.bus_url),
      adminUrl: toStringValue(raw.adminUrl ?? raw.admin_url),
      peerCount,
      recentEventCount: recentEventCount ?? parsePositiveInt(counters?.envelopesReceived),
      peers,
      updatedAt: toStringValue(raw.updatedAt ?? raw.updated_at),
    };
  } catch {
    return undefined;
  }
};

export const getFederationStatus = (): FederationStatusSummary | undefined => {
  return getFederationStatusFromSnapshot() ?? getFederationEnvStatus();
};

const getRunServiceHealth = (): RunServiceUsageSummary['health'] | undefined => {
  const snapshotPath = getSwarmHealthSnapshotPath();
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    return undefined;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Record<string, unknown>;
    const llama = typeof raw.llama === 'object' && raw.llama !== null ? raw.llama as Record<string, unknown> : {};

    const health = {
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      allReady: raw.allReady === true,
      exportsReady: typeof llama.url === 'string' && llama.url.length > 0,
      llama: {
        status: typeof llama.status === 'string' ? llama.status : 'unknown',
        reachable: llama.reachable === true,
        url: typeof llama.url === 'string' ? llama.url : undefined,
        model: typeof llama.model === 'string' ? llama.model : undefined,
        modelPresent: llama.modelPresent === true,
        inventoryPresent: llama.inventoryPresent === true,
        inventoryCount: typeof llama.inventoryCount === 'number' ? llama.inventoryCount : 0,
        inventoryHasSelected: llama.inventoryHasSelected === true,
      },
    } satisfies NonNullable<RunServiceUsageSummary['health']>;

    return health;
  } catch {
    return undefined;
  }
};

const recordCanonicalTaskChat = (input: {
  taskId: string;
  runId?: string;
  source: 'dashboard' | 'agent' | 'system';
  authorType: 'user' | 'agent' | 'system';
  authorId: string;
  body: string;
  externalThreadId?: string;
  externalMessageId?: string;
  metadata?: Record<string, unknown>;
}): void => {
  const database = getDatabase();
  const existing = database.prepare(`
    SELECT message_id
    FROM task_chat_messages
    WHERE task_id = ?
      AND source = ?
      AND author_id = ?
      AND body = ?
      AND created_at >= datetime('now', '-5 seconds')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(input.taskId, input.source, input.authorId, input.body) as { message_id?: string } | undefined;
  if (existing?.message_id) {
    return;
  }
  database.prepare(`
    INSERT INTO task_chat_messages (
      message_id, task_id, run_id, project_id, source, external_thread_id, external_message_id,
      author_type, author_id, body, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.taskId,
    input.runId ?? null,
    getProjectId(),
    input.source,
    input.externalThreadId ?? null,
    input.externalMessageId ?? null,
    input.authorType,
    input.authorId,
    input.body,
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString(),
  );
};

const normalizePriority = (value: unknown): TaskRecord['priority'] => {
  if (typeof value === 'string' && ['low', 'medium', 'high', 'urgent'].includes(value)) {
    return value as TaskRecord['priority'];
  }
  return 'medium';
};

const normalizeTaskType = (value: unknown): TaskRecord['taskType'] => {
  if (typeof value === 'string') {
    const candidate = value.toLowerCase();
    if (['feature', 'bug', 'hotfix', 'task'].includes(candidate)) {
      return candidate as TaskRecord['taskType'];
    }
  }
  return 'task';
};

const mapWorkflowStatusToBoardStatus = (value: unknown): BoardStatus => {
  const status = typeof value === 'string' ? value : 'queued';
  if (status === 'planning') {
    return 'planning';
  }
  if (status === 'waiting_on_dependency') {
    return 'planning';
  }
  if (status === 'running') {
    return 'in_progress';
  }
  if (status === 'waiting_on_human' || status === 'review' || status === 'failed') {
    return 'review';
  }
  if (status === 'in_review') {
    return 'review';
  }
  if (status === 'verified' || status === 'completed') {
    return 'done';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  return 'todo';
};

const buildTaskRecordFromRow = (row: BoardTaskRow, agentCount?: number): TaskRecord => {
  const metadata = parseMetadata(row.metadata_json);
  const stage = typeof metadata?.stage === 'string' ? metadata.stage : undefined;
  const description = typeof metadata?.description === 'string'
    ? metadata.description
    : row.name;
  const createdBy = typeof metadata?.created_by === 'string'
    ? metadata.created_by
    : 'operator';
  const displayName = typeof metadata?.created_by_display_name === 'string'
    ? metadata.created_by_display_name
    : createdBy;

  return {
    taskId: row.task_id,
    projectId: row.run_id,
    title: row.name,
    description,
    taskType: normalizeTaskType(metadata?.task_type ?? metadata?.taskType),
    priority: normalizePriority(row.priority),
    status: mapWorkflowStatusToBoardStatus(row.status),
    branchName: typeof metadata?.branch_name === 'string' ? metadata.branch_name : undefined,
    createdByUserId: createdBy,
    createdByDisplayName: displayName,
    needsClarification: Boolean(metadata?.needs_clarification),
    blockedReason: typeof metadata?.blocked_reason === 'string'
      ? metadata.blocked_reason
      : typeof metadata?.blockedReason === 'string'
        ? metadata.blockedReason
        : undefined,
    stage,
    updatedAt: row.updated_at,
    agentCount: typeof agentCount === 'number' ? agentCount : 0,
  };
};

const buildTaskNodeFromRow = (row: RawTaskRow): TaskNode => {
  const metadata = parseMetadata(row.metadata_json);
  return {
    taskId: row.task_id,
    name: row.name,
    status: row.status,
    priority: row.priority,
    parentTaskId: row.parent_task_id ?? undefined,
    stage: typeof metadata?.stage === 'string' ? metadata.stage : undefined,
    updatedAt: row.updated_at,
  };
};

const buildActiveAgents = (database: Database.Database, taskId: string): TaskDetails['activeAgents'] => {
  const rows = database
    .prepare(`
      SELECT aa.agent_name, aa.assigned_at, ta.metadata_json
      FROM agent_assignments aa
      JOIN task_attempts ta ON ta.attempt_id = aa.attempt_id
      WHERE ta.task_id = ?
      ORDER BY aa.assigned_at DESC
      LIMIT 20
    `)
    .all(taskId) as Array<{ agent_name: string; assigned_at: string; metadata_json?: string }>;

  const agentsMap = new Map<string, TaskDetails['activeAgents'][number]>();
  for (const row of rows) {
    const metadata = parseMetadata(row.metadata_json);
    const role = typeof metadata?.role === 'string' ? metadata.role : 'agent';
    if (!agentsMap.has(row.agent_name)) {
      agentsMap.set(row.agent_name, {
        name: row.agent_name,
        role,
        lastSeenAt: row.assigned_at,
      });
    }
  }

  if (agentsMap.size === 0) {
    return [{
      name: DEFAULT_ORCHESTRATOR_NAME,
      role: 'orchestrator',
      lastSeenAt: new Date().toISOString(),
    }];
  }

  return Array.from(agentsMap.values());
};

export const getProjectIdentity = (projectId = getProjectId()): ProjectIdentity => {
  const project = listProjects().find((entry) => entry.projectId === projectId);
  return {
    projectId,
    projectName: project?.name ?? getProjectName(),
  };
};

export const listProjects = (): ProjectSummary[] => {
  const database = getDatabase();
  return database.prepare(`
    SELECT project_id, name, description, updated_at
    FROM projects
    ORDER BY updated_at DESC
  `).all().map((row) => ({
    projectId: String((row as Record<string, unknown>).project_id),
    name: String((row as Record<string, unknown>).name),
    description: typeof (row as Record<string, unknown>).description === 'string' ? String((row as Record<string, unknown>).description) : undefined,
    updatedAt: String((row as Record<string, unknown>).updated_at),
  }));
};

export const listReposForProject = (projectId: string): RepoSummary[] => {
  const database = getDatabase();
  return database.prepare(`
    SELECT repo_id, project_id, name, root_path, default_branch
    FROM project_repos
    WHERE project_id = ?
    ORDER BY updated_at DESC
  `).all(projectId).map((row) => ({
    repoId: String((row as Record<string, unknown>).repo_id),
    projectId: String((row as Record<string, unknown>).project_id),
    name: String((row as Record<string, unknown>).name),
    rootPath: String((row as Record<string, unknown>).root_path),
    defaultBranch: String((row as Record<string, unknown>).default_branch),
  }));
};

export const listTaskChatMessages = (taskId: string): TaskChatSummary[] => {
  const database = getDatabase();
  return database.prepare(`
    SELECT message_id, task_id, source, author_type, author_id, body, created_at
    FROM task_chat_messages
    WHERE task_id = ?
    ORDER BY created_at ASC
  `).all(taskId).map((row) => ({
    id: String((row as Record<string, unknown>).message_id),
    taskId: String((row as Record<string, unknown>).task_id),
    source: String((row as Record<string, unknown>).source),
    authorType: String((row as Record<string, unknown>).author_type),
    authorId: String((row as Record<string, unknown>).author_id),
    body: String((row as Record<string, unknown>).body),
    createdAt: String((row as Record<string, unknown>).created_at),
  }));
};

export const listWorkerHeartbeatsForTask = (taskId: string): WorkerHeartbeatSummary[] => {
  const database = getDatabase();
  return database.prepare(`
    SELECT attempt_id, engine, model_tier, queue_depth, fallback_count, heartbeat_status, elapsed_ms, last_activity, created_at
    FROM worker_heartbeats
    WHERE task_id = ?
    ORDER BY created_at DESC
  `).all(taskId).map((row) => ({
    attemptId: String((row as Record<string, unknown>).attempt_id),
    engine: String((row as Record<string, unknown>).engine),
    modelTier: typeof (row as Record<string, unknown>).model_tier === 'string' ? String((row as Record<string, unknown>).model_tier) : undefined,
    queueDepth: typeof (row as Record<string, unknown>).queue_depth === 'number' ? Number((row as Record<string, unknown>).queue_depth) : undefined,
    fallbackCount: typeof (row as Record<string, unknown>).fallback_count === 'number' ? Number((row as Record<string, unknown>).fallback_count) : undefined,
    status: String((row as Record<string, unknown>).heartbeat_status),
    elapsedMs: Number((row as Record<string, unknown>).elapsed_ms),
    lastActivity: typeof (row as Record<string, unknown>).last_activity === 'string' ? String((row as Record<string, unknown>).last_activity) : undefined,
    createdAt: String((row as Record<string, unknown>).created_at),
  }));
};

export const listRoutingDecisionsForTask = (taskId: string): RoutingDecisionSummary[] => {
  const database = getDatabase();
  return database.prepare(`
    SELECT attempt_id, metadata_json
    FROM task_attempts
    WHERE task_id = ?
    ORDER BY created_at DESC
  `).all(taskId).flatMap((row) => {
    const metadata = parsePayload((row as Record<string, unknown>).metadata_json as string | null | undefined);
    const decision = metadata?.routing_decision;
    if (!decision || typeof decision !== 'object') {
      return [];
    }
    const record = decision as Record<string, unknown>;
    return [{
      attemptId: String((row as Record<string, unknown>).attempt_id),
      engine: typeof record.engine === 'string' ? record.engine : undefined,
      model: typeof record.model === 'string' ? record.model : undefined,
      modelTier: typeof record.modelTier === 'string' ? record.modelTier : typeof record.model_tier === 'string' ? record.model_tier : undefined,
      queueDepth: typeof record.queueDepth === 'number' ? record.queueDepth : typeof record.queue_depth === 'number' ? record.queue_depth : undefined,
      fallbackCount: typeof record.fallbackCount === 'number' ? record.fallbackCount : typeof record.fallback_count === 'number' ? record.fallback_count : undefined,
      routeKind: typeof record.routeKind === 'string' ? record.routeKind : typeof record.route_kind === 'string' ? record.route_kind : undefined,
      escalationReason: typeof record.escalationReason === 'string' ? record.escalationReason : typeof record.escalation_reason === 'string' ? record.escalation_reason : undefined,
      reason: typeof record.reason === 'string' ? record.reason : undefined,
      role: typeof record.role === 'string' ? record.role : undefined,
      readOnly: typeof record.readOnly === 'boolean' ? record.readOnly : undefined,
      complexity: typeof record.complexity === 'string' ? record.complexity : undefined,
      confidence: typeof record.confidence === 'number' ? record.confidence : undefined,
    }];
  });
};

export const getRunRoutingTelemetry = (runId?: string): RunRoutingTelemetrySummary | undefined => {
  if (!runId) {
    return undefined;
  }

  try {
    const database = getDatabase();
    const attemptRows = database.prepare(`
      SELECT attempt_id, metadata_json
      FROM task_attempts
      WHERE run_id = ?
    `).all(runId) as Array<{ attempt_id: string; metadata_json?: string | null }>;
    const resultRows = database.prepare(`
      SELECT attempt_id, engine, model_tier, queue_depth, fallback_count, created_at
      FROM worker_results
      WHERE run_id = ?
      ORDER BY created_at DESC
    `).all(runId) as Array<{
      attempt_id: string;
      engine?: string | null;
      model_tier?: string | null;
      queue_depth?: number | null;
      fallback_count?: number | null;
      created_at: string;
    }>;
    const heartbeatRows = database.prepare(`
      SELECT attempt_id, engine, elapsed_ms, created_at
      FROM worker_heartbeats
      WHERE run_id = ?
      ORDER BY created_at DESC
    `).all(runId) as Array<{
      attempt_id: string;
      engine?: string | null;
      elapsed_ms: number;
      created_at: string;
    }>;

    const attemptMetadata = new Map<string, Record<string, unknown>>();
    for (const row of attemptRows) {
      attemptMetadata.set(row.attempt_id, parseMetadata(row.metadata_json) ?? {});
    }

    const latestResults = new Map<string, {
      engine?: string;
      modelTier?: string;
      queueDepth?: number;
      fallbackCount?: number;
    }>();
    for (const row of resultRows) {
      if (latestResults.has(row.attempt_id)) {
        continue;
      }
      latestResults.set(row.attempt_id, {
        engine: typeof row.engine === 'string' ? row.engine : undefined,
        modelTier: typeof row.model_tier === 'string' ? row.model_tier : undefined,
        queueDepth: typeof row.queue_depth === 'number' ? row.queue_depth : undefined,
        fallbackCount: typeof row.fallback_count === 'number' ? row.fallback_count : undefined,
      });
    }

    const maxElapsedByAttempt = new Map<string, { engine: string; elapsedMs: number }>();
    for (const row of heartbeatRows) {
      const elapsedMs = Number(row.elapsed_ms);
      if (Number.isNaN(elapsedMs)) {
        continue;
      }
      const existing = maxElapsedByAttempt.get(row.attempt_id);
      const engine = typeof row.engine === 'string' ? row.engine : 'unknown';
      if (!existing || elapsedMs > existing.elapsedMs) {
        maxElapsedByAttempt.set(row.attempt_id, { engine, elapsedMs });
      }
    }

    const modelTierCounts = new Map<string, number>();
    const escalationReasons = new Map<string, number>();
    const latencyByRoleEngine = new Map<string, { role: string; engine: string; total: number; count: number }>();
    let queueDepthTotal = 0;
    let queueDepthCount = 0;
    let fallbackTotal = 0;
    let fallbackTotalCount = 0;
    let cloudEscalationCount = 0;

    for (const [attemptId, metadata] of attemptMetadata.entries()) {
      const result = latestResults.get(attemptId);
      const routingDecision = typeof metadata.routing_decision === 'object' && metadata.routing_decision !== null
        ? metadata.routing_decision as Record<string, unknown>
        : {};
      const modelTier = result?.modelTier
        ?? (typeof metadata.model_tier === 'string' ? metadata.model_tier : undefined)
        ?? (typeof routingDecision.modelTier === 'string' ? routingDecision.modelTier : undefined)
        ?? 'unassigned';
      modelTierCounts.set(modelTier, (modelTierCounts.get(modelTier) ?? 0) + 1);

      if (typeof result?.queueDepth === 'number') {
        queueDepthTotal += result.queueDepth;
        queueDepthCount += 1;
      }
      if (typeof result?.fallbackCount === 'number') {
        fallbackTotal += result.fallbackCount;
        fallbackTotalCount += 1;
      }

      const escalationReason = typeof routingDecision.escalationReason === 'string'
        ? routingDecision.escalationReason
        : undefined;
      const routeKind = typeof routingDecision.routeKind === 'string'
        ? routingDecision.routeKind
        : undefined;
      if (escalationReason || (typeof routeKind === 'string' && routeKind.includes('cloud'))) {
        cloudEscalationCount += 1;
      }
      if (escalationReason) {
        escalationReasons.set(escalationReason, (escalationReasons.get(escalationReason) ?? 0) + 1);
      }

      const role = typeof metadata.role === 'string' ? metadata.role : 'worker';
      const latency = maxElapsedByAttempt.get(attemptId);
      if (latency) {
        const key = `${role}::${latency.engine}`;
        const existing = latencyByRoleEngine.get(key) ?? {
          role,
          engine: latency.engine,
          total: 0,
          count: 0,
        };
        existing.total += latency.elapsedMs;
        existing.count += 1;
        latencyByRoleEngine.set(key, existing);
      }
    }

    return {
      modelTierCounts: Array.from(modelTierCounts.entries())
        .map(([modelTier, count]) => ({ modelTier, count }))
        .sort((left, right) => right.count - left.count),
      averageQueueDepth: queueDepthCount > 0 ? Number((queueDepthTotal / queueDepthCount).toFixed(2)) : 0,
      averageFallbackCount: fallbackTotalCount > 0 ? Number((fallbackTotal / fallbackTotalCount).toFixed(2)) : 0,
      cloudEscalationCount,
      escalationReasons: Array.from(escalationReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count),
      averageLatencyByRoleAndEngine: Array.from(latencyByRoleEngine.values())
        .map((entry) => ({
          role: entry.role,
          engine: entry.engine,
          averageElapsedMs: Number((entry.total / entry.count).toFixed(0)),
        }))
        .sort((left, right) => right.averageElapsedMs - left.averageElapsedMs),
    };
  } catch {
    return undefined;
  }
};

export const getRunAllocatorPolicy = (runId?: string): RunAllocatorPolicySummary | undefined => {
  if (!runId) {
    return undefined;
  }

  try {
    const database = getDatabase();
    const row = database
      .prepare('SELECT metadata_json FROM runs WHERE run_id = ?')
      .get(runId) as { metadata_json?: string | null } | undefined;
    const metadata = parseMetadata(row?.metadata_json);
    const policy = typeof metadata?.allocator_policy === 'object' && metadata.allocator_policy !== null
      ? metadata.allocator_policy as Record<string, unknown>
      : undefined;
    if (!policy) {
      return undefined;
    }
    return {
      maxParallelHelpers: typeof policy.maxParallelHelpers === 'number' ? policy.maxParallelHelpers : undefined,
      maxSameRoleHelpers: typeof policy.maxSameRoleHelpers === 'number' ? policy.maxSameRoleHelpers : undefined,
      localQueueTolerance: typeof policy.localQueueTolerance === 'number' ? policy.localQueueTolerance : undefined,
      cloudEscalationAllowed: typeof policy.cloudEscalationAllowed === 'boolean' ? policy.cloudEscalationAllowed : undefined,
      priorityBias: typeof policy.priorityBias === 'string' ? policy.priorityBias as RunAllocatorPolicySummary['priorityBias'] : undefined,
    };
  } catch {
    return undefined;
  }
};

export const getRunTopology = (runId?: string): SwarmTopologySummary | undefined => {
  if (!runId) {
    return undefined;
  }

  try {
    const database = getDatabase();
    const runRow = database
      .prepare('SELECT metadata_json FROM runs WHERE run_id = ?')
      .get(runId) as { metadata_json?: string | null } | undefined;
    const runMetadata = parseMetadata(runRow?.metadata_json);
    const persistedSnapshot = typeof runMetadata?.topology_snapshot === 'object' && runMetadata.topology_snapshot !== null
      ? runMetadata.topology_snapshot as Record<string, unknown>
      : undefined;
    const taskNameMap = buildTaskNameMap(database, runId);
    const taskRows = fetchRawTaskRows(database, runId);
    const taskById = new Map(taskRows.map((task) => [task.task_id, task] as const));
    const attemptRows = database.prepare(`
      SELECT attempt_id, task_id, agent_name, status, metadata_json
      FROM task_attempts
      WHERE run_id = ?
      ORDER BY created_at ASC
    `).all(runId) as Array<{
      attempt_id: string;
      task_id: string;
      agent_name: string;
      status: string;
      metadata_json?: string | null;
    }>;
    const activeRoleCounts = new Map<string, number>();
    const helpers = attemptRows.map((row) => {
      const metadata = parseMetadata(row.metadata_json);
      const routingDecision = typeof metadata?.routing_decision === 'object' && metadata.routing_decision !== null
        ? metadata.routing_decision as Record<string, unknown>
        : undefined;
      const role = typeof metadata?.role === 'string' ? metadata.role : 'unknown';
      if (row.status === 'running') {
        activeRoleCounts.set(role, (activeRoleCounts.get(role) ?? 0) + 1);
      }
      const task = taskById.get(row.task_id);
      return {
        attemptId: row.attempt_id,
        taskId: row.task_id,
        taskName: taskNameMap.get(row.task_id) ?? row.task_id,
        parentTaskId: task?.parent_task_id ?? undefined,
        role,
        agentName: row.agent_name,
        status: row.status,
        taskStatus: task?.status ?? 'queued',
        modelTier: typeof metadata?.model_tier === 'string' ? metadata.model_tier : undefined,
        routeKind: typeof routingDecision?.routeKind === 'string' ? routingDecision.routeKind : undefined,
        queueDepth: typeof metadata?.queue_depth === 'number' ? metadata.queue_depth : undefined,
        fallbackCount: typeof metadata?.fallback_count === 'number' ? metadata.fallback_count : undefined,
      };
    });

    return {
      capturedAt: typeof persistedSnapshot?.capturedAt === 'string' ? persistedSnapshot.capturedAt : undefined,
      activeRoles: [...activeRoleCounts.entries()]
        .map(([role, count]) => ({ role, count }))
        .sort((left, right) => right.count - left.count || left.role.localeCompare(right.role)),
      helpers,
    };
  } catch {
    return undefined;
  }
};

export const getRunServiceUsage = (runId?: string): RunServiceUsageSummary | undefined => {
  if (!runId) {
    return undefined;
  }

  try {
    const database = getDatabase();

    const attemptRows = database.prepare(`
      SELECT attempt_id, metadata_json
      FROM task_attempts
      WHERE run_id = ?
    `).all(runId) as Array<{ attempt_id: string; metadata_json?: string | null }>;
    const resultRows = database.prepare(`
      SELECT attempt_id, engine, success, payload_json
      FROM worker_results
      WHERE run_id = ?
      ORDER BY created_at DESC
    `).all(runId) as Array<{
      attempt_id: string;
      engine?: string | null;
      success: number;
      payload_json?: string | null;
    }>;
    const heartbeatRows = database.prepare(`
      SELECT attempt_id, engine, elapsed_ms
      FROM worker_heartbeats
      WHERE run_id = ?
      ORDER BY created_at DESC
    `).all(runId) as Array<{
      attempt_id: string;
      engine?: string | null;
      elapsed_ms: number;
    }>;

    const attemptMetadata = new Map<string, Record<string, unknown>>();
    for (const row of attemptRows) {
      attemptMetadata.set(row.attempt_id, parseMetadata(row.metadata_json) ?? {});
    }

    const latestResultByAttempt = new Map<string, {
      engine?: string;
      success: boolean;
      payload?: Record<string, unknown>;
    }>();
    for (const row of resultRows) {
      if (latestResultByAttempt.has(row.attempt_id)) {
        continue;
      }
      latestResultByAttempt.set(row.attempt_id, {
        engine: typeof row.engine === 'string' ? row.engine : undefined,
        success: row.success === 1,
        payload: parsePayload(row.payload_json),
      });
    }

    const maxHeartbeatElapsed = new Map<string, number>();
    for (const row of heartbeatRows) {
      if (typeof row.elapsed_ms !== 'number' || Number.isNaN(row.elapsed_ms)) {
        continue;
      }
      const current = maxHeartbeatElapsed.get(row.attempt_id) ?? 0;
      if (row.elapsed_ms > current) {
        maxHeartbeatElapsed.set(row.attempt_id, row.elapsed_ms);
      }
    }

    const llamaRoleCounts = new Map<string, number>();
    const bypassReasons = new Map<string, number>();
    let llamaRequestCount = 0;
    let llamaFailureCount = 0;
    let totalLlamaLatency = 0;
    let totalLlamaLatencyCount = 0;
    let localCapableAttempts = 0;
    let localCapableLocalAttempts = 0;
    let localCapableCloudAttempts = 0;

    for (const [attemptId, metadata] of attemptMetadata.entries()) {
      const role = typeof metadata.role === 'string' ? metadata.role : 'worker';
      const routingDecision = typeof metadata.routing_decision === 'object' && metadata.routing_decision !== null
        ? metadata.routing_decision as Record<string, unknown>
        : undefined;
      const engine = typeof routingDecision?.engine === 'string'
        ? routingDecision.engine
        : latestResultByAttempt.get(attemptId)?.engine;

      const isLocalCapableRole = ['planner', 'researcher', 'reviewer', 'verifier', 'checkpoint-compressor', 'arbiter', 'summarizer'].includes(role);
      if (isLocalCapableRole) {
        localCapableAttempts += 1;
        if (engine === 'local-llama' || engine === 'mlx' || engine === 'apple-intelligence') {
          localCapableLocalAttempts += 1;
        }
        if (typeof engine === 'string' && !['local-llama', 'mlx', 'apple-intelligence'].includes(engine)) {
          localCapableCloudAttempts += 1;
        }
      }

      if (engine === 'local-llama') {
        llamaRequestCount += 1;
        llamaRoleCounts.set(role, (llamaRoleCounts.get(role) ?? 0) + 1);
        const result = latestResultByAttempt.get(attemptId);
        if (result && !result.success) {
          llamaFailureCount += 1;
        }
        const payload = result?.payload;
        const payloadDuration = typeof payload?.durationMs === 'number' ? payload.durationMs : undefined;
        const heartbeatDuration = maxHeartbeatElapsed.get(attemptId);
        const durationMs = payloadDuration ?? heartbeatDuration;
        if (typeof durationMs === 'number' && durationMs >= 0) {
          totalLlamaLatency += durationMs;
          totalLlamaLatencyCount += 1;
        }
      }

      const escalationReason = typeof routingDecision?.escalationReason === 'string'
        ? routingDecision.escalationReason
        : undefined;
      if (isLocalCapableRole && escalationReason) {
        bypassReasons.set(escalationReason, (bypassReasons.get(escalationReason) ?? 0) + 1);
      }
    }

    const localCoveragePercent = localCapableAttempts > 0
      ? Number(((localCapableLocalAttempts / localCapableAttempts) * 100).toFixed(1))
      : 0;
    const cloudBypassRatePercent = localCapableAttempts > 0
      ? Number(((localCapableCloudAttempts / localCapableAttempts) * 100).toFixed(1))
      : 0;

    const health = getRunServiceHealth();
    const policyActions: string[] = [];
    if (health && !health.allReady) {
      if (!health.llama.reachable) {
        policyActions.push('llama.cpp is not reachable from the swarm runtime.');
      }
      if (!health.llama.inventoryHasSelected) {
        policyActions.push('The selected llama model is missing from the exported inventory.');
      }
      if (!health.exportsReady) {
        policyActions.push('One or more local service URLs were not exported to the runtime.');
      }
    }
    if (localCapableAttempts > 0 && localCoveragePercent < 80) {
      policyActions.push('Local-capable roles are missing the 80% local coverage target.');
    }
    if (localCapableAttempts > 0 && cloudBypassRatePercent >= 10) {
      policyActions.push('Cloud bypass rate is above the 10% target for standard local-first runs.');
    }
    const policyStatus: RunServiceUsageSummary['policy']['status'] = policyActions.length === 0
      ? 'healthy'
      : (
        health && (!health.allReady || !health.llama.reachable || !health.exportsReady)
          ? 'action-needed'
          : 'warning'
      );

    return {
      health,
      llama: {
        requestCount: llamaRequestCount,
        failureCount: llamaFailureCount,
        averageLatencyMs: totalLlamaLatencyCount > 0
          ? Number((totalLlamaLatency / totalLlamaLatencyCount).toFixed(0))
          : 0,
        localRoleCoverage: Array.from(llamaRoleCounts.entries())
          .map(([role, count]) => ({ role, count }))
          .sort((left, right) => right.count - left.count || left.role.localeCompare(right.role)),
        localCoveragePercent,
        cloudBypassRatePercent,
        bypassReasons: Array.from(bypassReasons.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
        meetsLocalCoverageTarget: localCoveragePercent >= 80,
        meetsCloudEscalationTarget: cloudBypassRatePercent < 10,
      },
      policy: {
        status: policyStatus,
        summary: policyStatus === 'healthy'
          ? 'Local service availability and local-first coverage are within target.'
          : policyStatus === 'action-needed'
            ? 'Runtime health or local-first coverage is below the expected operating target.'
            : 'Local service usage is visible, but at least one target needs operator attention.',
        actions: policyActions,
      },
    };
  } catch {
    return undefined;
  }
};

const getLatestTaskDigest = (database: Database.Database, taskId: string): TaskDetails['latestDigest'] => {
  const row = database.prepare(`
    SELECT payload_json
    FROM task_state_digests
    WHERE task_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as { payload_json?: string | null } | undefined;
  const payload = parsePayload(row?.payload_json);
  if (!payload) {
    return undefined;
  }

  return {
    id: typeof payload.id === 'string' ? payload.id : taskId,
    objective: typeof payload.objective === 'string' ? payload.objective : 'Unknown objective',
    currentPlan: Array.isArray(payload.currentPlan) ? payload.currentPlan.filter((entry): entry is string => typeof entry === 'string') : [],
    decisions: Array.isArray(payload.decisions) ? payload.decisions.filter((entry): entry is string => typeof entry === 'string') : [],
    openQuestions: Array.isArray(payload.openQuestions) ? payload.openQuestions.filter((entry): entry is string => typeof entry === 'string') : [],
    activeRisks: Array.isArray(payload.activeRisks) ? payload.activeRisks.filter((entry): entry is string => typeof entry === 'string') : [],
    artifactIndex: Array.isArray(payload.artifactIndex)
      ? payload.artifactIndex.flatMap((entry): NonNullable<TaskDetails['latestDigest']>['artifactIndex'] => {
        if (typeof entry !== 'object' || entry === null) {
          return [];
        }
        const record = entry as Record<string, unknown>;
        if (typeof record.artifactId !== 'string' || typeof record.kind !== 'string' || typeof record.summary !== 'string') {
          return [];
        }
        return [{
          artifactId: record.artifactId,
          kind: record.kind,
          summary: record.summary,
          reasonRelevant: typeof record.reasonRelevant === 'string' ? record.reasonRelevant : undefined,
          trustConfidence: typeof record.trustConfidence === 'number' ? record.trustConfidence : undefined,
          sourceTaskId: typeof record.sourceTaskId === 'string' ? record.sourceTaskId : undefined,
          supersededBy: typeof record.supersededBy === 'string' ? record.supersededBy : undefined,
        }];
      })
      : [],
    verificationState: typeof payload.verificationState === 'string' ? payload.verificationState : 'unknown',
    lastUpdatedBy: typeof payload.lastUpdatedBy === 'string' ? payload.lastUpdatedBy : 'unknown',
    updatedAt: typeof payload.ts === 'string' ? payload.ts : new Date(0).toISOString(),
    droidspeak: typeof payload.droidspeak === 'object' && payload.droidspeak !== null
      ? payload.droidspeak as DroidspeakV2State
      : undefined,
  };
};

const getLatestHandoffPacket = (database: Database.Database, taskId: string, runId: string): TaskDetails['latestHandoff'] => {
  const row = database.prepare(`
    SELECT payload_json
    FROM handoff_packets
    WHERE (task_id = ? OR from_task_id = ? OR to_task_id = ?)
      AND run_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId, taskId, taskId, runId) as { payload_json?: string | null } | undefined;
  const payload = parsePayload(row?.payload_json);
  if (!payload) {
    return undefined;
  }

  return {
    id: typeof payload.id === 'string' ? payload.id : taskId,
    summary: typeof payload.summary === 'string' ? payload.summary : 'No handoff summary recorded.',
    toRole: typeof payload.toRole === 'string' ? payload.toRole : 'unknown',
    requiredReads: Array.isArray(payload.requiredReads) ? payload.requiredReads.filter((entry): entry is string => typeof entry === 'string') : [],
    digestId: typeof payload.digestId === 'string' ? payload.digestId : 'unknown',
    createdAt: typeof payload.ts === 'string' ? payload.ts : new Date(0).toISOString(),
    droidspeak: typeof payload.droidspeak === 'object' && payload.droidspeak !== null
      ? payload.droidspeak as DroidspeakV2State
      : undefined,
  };
};

export const getProjectMemory = (projectId: string): ProjectMemorySummary => {
  const database = getDatabase();
  return {
    facts: database.prepare(`
      SELECT fact_id, statement, confidence, status, created_at
      FROM project_facts
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(projectId).map((row) => ({
      id: String((row as Record<string, unknown>).fact_id),
      statement: String((row as Record<string, unknown>).statement),
      confidence: Number((row as Record<string, unknown>).confidence),
      status: String((row as Record<string, unknown>).status),
      createdAt: String((row as Record<string, unknown>).created_at),
    })),
    decisions: database.prepare(`
      SELECT decision_id, summary, why, created_at
      FROM project_decisions
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(projectId).map((row) => ({
      id: String((row as Record<string, unknown>).decision_id),
      summary: String((row as Record<string, unknown>).summary),
      why: String((row as Record<string, unknown>).why),
      createdAt: String((row as Record<string, unknown>).created_at),
    })),
    checkpoints: database.prepare(`
      SELECT project_checkpoint_id, summary, created_at
      FROM project_checkpoints
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(projectId).map((row) => ({
      id: String((row as Record<string, unknown>).project_checkpoint_id),
      summary: String((row as Record<string, unknown>).summary),
      createdAt: String((row as Record<string, unknown>).created_at),
    })),
  };
};

export const listOperatorMessages = (): MessageRecord[] => {
  try {
    const database = getDatabase();
    const rows = database
      .prepare('SELECT * FROM messages WHERE channel_id = ? AND project_id = ? ORDER BY created_at ASC LIMIT 200')
      .all('operator', getProjectId()) as Record<string, unknown>[];

    return rows.map(mapMessageRecord);
  } catch {
    return [];
  }
};

export const listRuns = (projectId = getProjectId()): RunSummary[] => {
  try {
    const database = getDatabase();
    const rows = database
      .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC')
      .all(projectId) as Array<{
        run_id: string;
        project_id: string;
        status: string;
        metadata_json?: string | null;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      runId: row.run_id,
      status: row.status,
      metadata: parseMetadata(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch {
    return [];
  }
};

export const getPreferredBoardRunId = (projectId = getProjectId()): string | undefined => {
  const runs = listRuns(projectId);
  if (runs.length === 0) {
    return undefined;
  }

  const activeRun = runs.find((run) => run.status === 'running');
  if (activeRun) {
    return activeRun.runId;
  }

  const resumableRun = runs.find((run) => run.status === 'starting' || run.status === 'degraded');
  return resumableRun?.runId ?? runs[0]?.runId;
};

export const listBoardTasksForRun = (runId?: string): TaskRecord[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = fetchTaskRowsForRun(database, runId);
    return rows.map((row) => buildTaskRecordFromRow(row, typeof row.agent_count === 'number' ? row.agent_count : 0));
  } catch {
    return [];
  }
};

export const listTaskNodesForRun = (runId?: string): TaskNode[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = fetchRawTaskRows(database, runId);
    return rows.map(buildTaskNodeFromRow);
  } catch {
    return [];
  }
};

export const listArtifactsForRun = (runId?: string): ArtifactSummary[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = database
      .prepare(`
        SELECT artifact_id, task_id, kind, summary, created_at
        FROM artifacts
        WHERE run_id = ?
        ORDER BY created_at DESC
        LIMIT 6
      `)
      .all(runId) as Array<{
        artifact_id: string;
        task_id: string;
        kind: string;
        summary: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      artifactId: row.artifact_id,
      taskId: row.task_id,
      kind: row.kind,
      summary: row.summary,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
};

export const listCheckpointsForRun = (runId?: string): CheckpointSummary[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = database
      .prepare(`
        SELECT checkpoint_id, task_id, payload_json, created_at
        FROM checkpoints
        WHERE run_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `)
      .all(runId) as Array<{
        checkpoint_id: string;
        task_id: string;
        payload_json?: string | null;
        created_at: string;
      }>;

    return rows.map((row) => {
      const metadata = parseMetadata(row.payload_json);
      const summary = typeof metadata?.summary === 'string' ? metadata.summary : undefined;
      return {
        checkpointId: row.checkpoint_id,
        taskId: row.task_id,
        summary,
        createdAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
};

export const listBudgetEventsForRun = (runId?: string): BudgetEventSummary[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = database
      .prepare(`
        SELECT event_id, task_id, detail, consumed, created_at
        FROM budget_events
        WHERE run_id = ?
        ORDER BY created_at DESC
        LIMIT 6
      `)
      .all(runId) as Array<{
        event_id: string;
        task_id?: string | null;
        detail: string;
        consumed: number;
        created_at: string;
      }>;

    return rows.map((row) => ({
      eventId: row.event_id,
      taskId: typeof row.task_id === 'string' ? row.task_id : undefined,
      detail: row.detail,
      consumed: row.consumed,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
};

export const listAgentAssignmentsForRun = (runId?: string): AgentAssignmentSummary[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = database
      .prepare(`
        SELECT aa.agent_name, aa.assigned_at, ta.task_id, t.name AS task_name, ta.metadata_json
        FROM agent_assignments aa
        JOIN task_attempts ta ON ta.attempt_id = aa.attempt_id
        JOIN tasks t ON t.task_id = ta.task_id
        WHERE ta.run_id = ?
        ORDER BY aa.assigned_at DESC
        LIMIT 6
      `)
      .all(runId) as Array<{
        agent_name: string;
        assigned_at: string;
        task_id: string;
        task_name: string;
        metadata_json?: string | null;
      }>;

    return rows.map((row) => {
      const metadata = parseMetadata(row.metadata_json);
      return {
        agentName: row.agent_name,
        role: typeof metadata?.role === 'string' ? metadata.role : undefined,
        taskId: row.task_id,
        taskName: row.task_name,
        assignedAt: row.assigned_at,
      };
    });
  } catch {
    return [];
  }
};

export const listVerificationOutcomesForRun = (runId?: string): VerificationTaskSummary[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = database
      .prepare(`
        SELECT vr.task_id, vr.stage, vr.status, vr.created_at, t.name AS task_name, t.parent_task_id
        FROM verification_reviews vr
        JOIN tasks t ON t.task_id = vr.task_id
        WHERE vr.run_id = ?
        ORDER BY vr.created_at DESC
        LIMIT 6
      `)
      .all(runId) as Array<{
        task_id: string;
        stage: string;
        status: string;
        created_at: string;
        task_name: string;
        parent_task_id?: string | null;
      }>;

    return rows.map((row) => ({
      taskId: row.task_id,
      name: row.task_name,
      stage: row.stage,
      status: row.status,
      parentTaskId: row.parent_task_id ?? undefined,
      updatedAt: row.created_at,
    }));
  } catch {
    return [];
  }
};

export const listTaskDependenciesForRun = (runId?: string): DependencySummary[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const rows = database
      .prepare(`
        SELECT td.dependency_id, td.task_id, td.depends_on_task_id, td.created_at
        FROM task_dependencies td
        JOIN tasks t ON t.task_id = td.task_id
        WHERE t.run_id = ?
        ORDER BY td.created_at DESC
      `)
      .all(runId) as Array<{
        dependency_id: string;
        task_id: string;
        depends_on_task_id: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      dependencyId: row.dependency_id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
};

const buildTaskNameMap = (database: Database.Database, runId: string): Map<string, string> => {
  const rows = database
    .prepare('SELECT task_id, name FROM tasks WHERE run_id = ?')
    .all(runId) as Array<{ task_id: string; name: string }>;
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.task_id, row.name);
  }
  return map;
};

type ExecutionEventTimelineRow = {
  event_id: string;
  event_type: string;
  detail: string;
  metadata_json?: string | null;
  created_at: string;
};

const mapExecutionEventRow = (
  row: ExecutionEventTimelineRow,
  taskNames: Map<string, string>,
): RunTimelineEntry => {
  const metadata = parsePayload(row.metadata_json ?? '') ?? {};
  const detailParts: string[] = [row.detail];
  if (typeof metadata.detail === 'string' && metadata.detail.trim().length > 0) {
    detailParts.push(metadata.detail);
  }
  if (typeof metadata.summary === 'string' && metadata.summary.trim().length > 0) {
    detailParts.push(metadata.summary);
  }
  if (typeof metadata.status === 'string' && metadata.status.trim().length > 0) {
    detailParts.push(`status ${metadata.status}`);
  }

  const assignedAgents = metadata.assigned_agents;
  if (Array.isArray(assignedAgents)) {
    const names = assignedAgents
      .map((maybeAgent) => {
        if (typeof maybeAgent === 'object' && maybeAgent !== null) {
          const agent = maybeAgent as Record<string, unknown>;
          const agentName = agent.agent_name;
          return typeof agentName === 'string' ? agentName : undefined;
        }
        return undefined;
      })
      .filter((candidate): candidate is string => typeof candidate === 'string');
    if (names.length > 0) {
      detailParts.push(`Assigned ${names.join(', ')}`);
    }
  }

  const detail = detailParts.filter((part) => part && part.length > 0).join(' · ') || row.event_type;
  const metadataTaskId = typeof metadata.taskId === 'string' ? metadata.taskId : undefined;
  const actorType = typeof metadata.actor_type === 'string' ? metadata.actor_type : 'system';
  const actorId = typeof metadata.actor_id === 'string' ? metadata.actor_id : 'system';

  return {
    eventId: row.event_id,
    taskId: metadataTaskId,
    taskName: metadataTaskId ? taskNames.get(metadataTaskId) : undefined,
    eventType: row.event_type,
    detail,
    actorType,
    actorId,
    createdAt: row.created_at,
  };
};

export const listRunTimelineEvents = (runId?: string): RunTimelineEntry[] => {
  if (!runId) {
    return [];
  }

  try {
    const database = getDatabase();
    const taskNames = buildTaskNameMap(database, runId);
    const rows = database
      .prepare(`
        SELECT event_id, event_type, detail, metadata_json, created_at
        FROM execution_events
        WHERE run_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `)
      .all(runId) as ExecutionEventTimelineRow[];

    return rows.map((row) => mapExecutionEventRow(row, taskNames));
  } catch {
    return [];
  }
};

export const getAuditTrail = (runId?: string): AuditTrailSummary => {
  try {
    const database = getDatabase();
    const rows = readAuditRows(database, 25);
    const latestEvents = rows
      .map((row) => {
        const payload = inflateAuditPayload(row.payload);
        return {
          row,
          payload,
        };
      })
      .filter((event) => {
        if (!runId) {
          return true;
        }
        const payloadRunId = typeof event.payload.runId === 'string'
          ? event.payload.runId
          : typeof event.payload.run_id === 'string'
            ? event.payload.run_id
            : undefined;
        return payloadRunId === runId;
      })
      .slice(0, 12)
      .map((event) => {
        const payload = event.payload;
        const detail = [
          typeof payload.detail === 'string' ? payload.detail : undefined,
          typeof payload.summary === 'string' ? payload.summary : undefined,
          typeof payload.eventType === 'string' ? payload.eventType : undefined,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' · ') || event.row.event_type;

        return {
          id: event.row.id,
          ts: event.row.ts,
          eventType: event.row.event_type,
          nodeId: event.row.node_id,
          taskId: typeof payload.taskId === 'string'
            ? payload.taskId
            : typeof payload.task_id === 'string'
              ? payload.task_id
              : undefined,
          runId: typeof payload.runId === 'string'
            ? payload.runId
            : typeof payload.run_id === 'string'
              ? payload.run_id
              : undefined,
          detail,
          hash: event.row.merkle_leaf,
        };
      });

    const allRows = readAuditRows(database).reverse();
    let previousHash = GENESIS_AUDIT_HASH;
    let chainVerified = true;
    for (const row of allRows) {
      let payload: Record<string, unknown>;
      try {
        payload = inflateAuditPayload(row.payload);
      } catch {
        chainVerified = false;
        break;
      }
      const expectedLeaf = computeAuditLeafHash({
        ts: row.ts,
        swarmId: row.swarm_id,
        nodeId: row.node_id,
        eventType: row.event_type,
        payload,
        prevHash: previousHash,
        height: row.height,
      });
      if (
        row.prev_hash !== previousHash
        || row.merkle_leaf !== expectedLeaf
        || !verifyAuditSignature(expectedLeaf, row.signature)
      ) {
        chainVerified = false;
        break;
      }
      previousHash = row.merkle_leaf;
    }

    return {
      merkleRoot: computeAuditMerkleRoot(allRows.map((row) => row.merkle_leaf)),
      chainVerified,
      latestEvents,
    };
  } catch {
    return {
      merkleRoot: 'unavailable',
      chainVerified: false,
      latestEvents: [],
    };
  }
};

export const getTaskDetails = (taskId: string): TaskDetails | null => {
  try {
    const database = getDatabase();
    const taskRow = database
      .prepare(`
        SELECT t.*
        FROM tasks t
        JOIN runs r ON r.run_id = t.run_id
        WHERE t.task_id = ? AND r.project_id = ?
      `)
      .get(taskId, getProjectId()) as Record<string, unknown> | undefined;

    if (!taskRow) {
      return null;
    }

    const rawRow = taskRow as BoardTaskRow;
    const task = buildTaskRecordFromRow(rawRow, countAgentsForTask(database, taskId));
    const messages = (
      database
        .prepare('SELECT * FROM messages WHERE task_id = ? AND project_id = ? ORDER BY created_at ASC')
        .all(taskId, getProjectId()) as Record<string, unknown>[]
    ).map(mapMessageRecord);

    const activeAgents = task.status === 'cancelled' ? [] : buildActiveAgents(database, taskId);
    const dependencyRows = database
      .prepare('SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as Array<{ depends_on_task_id: string }>;
    const planEvents = database
      .prepare(`
        SELECT detail
        FROM execution_events
        WHERE task_id = ? AND event_type = ?
        ORDER BY created_at DESC
        LIMIT 3
      `)
      .all(taskId, 'plan_proposed') as Array<{ detail: string }>;
    const budgetEvents = database
      .prepare(`
        SELECT detail, consumed
        FROM budget_events
        WHERE task_id = ?
        ORDER BY created_at DESC
        LIMIT 2
      `)
      .all(taskId) as Array<{ detail: string; consumed: number }>;
    const operatorActions = database
      .prepare(`
        SELECT action_type, detail
        FROM operator_actions
        WHERE task_id = ?
        ORDER BY created_at DESC
        LIMIT 2
      `)
      .all(taskId) as Array<{ action_type: string; detail: string }>;
    const latestDigest = getLatestTaskDigest(database, taskId);
    const latestHandoff = getLatestHandoffPacket(database, taskId, rawRow.run_id);
    const routingTelemetry = listRoutingDecisionsForTask(taskId)[0];
    const inferredHandoffs = buildTaskHandoffs(
      dependencyRows.map((row) => row.depends_on_task_id),
      planEvents.map((row) => row.detail),
    );
    const canonicalHandoffs = latestHandoff
      ? [
        `Handoff to ${latestHandoff.toRole}: ${latestHandoff.summary}`,
        ...(latestHandoff.requiredReads.map((read) => `Required read: ${read}`)),
      ]
      : [];
    const handoffs = canonicalHandoffs.length > 0
      ? canonicalHandoffs
      : (inferredHandoffs.length > 0 ? inferredHandoffs : ['No handoffs recorded for this task yet.']);
    const bestCurrentUnderstanding = latestDigest
      ? {
        objective: latestDigest.objective,
        plan: latestDigest.currentPlan,
        blockers: latestDigest.activeRisks,
        keyFindings: latestDigest.decisions.length > 0
          ? latestDigest.decisions
          : latestDigest.artifactIndex
            .map((artifact) => artifact.reasonRelevant ?? artifact.summary)
            .filter((entry, index, items) => items.indexOf(entry) === index)
            .slice(0, 5),
        artifacts: latestDigest.artifactIndex.map((artifact) => ({
          artifactId: artifact.artifactId,
          summary: artifact.summary,
          reasonRelevant: artifact.reasonRelevant,
        })),
        verificationStatus: latestDigest.verificationState,
        latestHandoffSummary: latestHandoff?.summary,
      }
      : undefined;

    return {
      task,
      messages,
      activeAgents,
      handoffs,
      handoffSource: canonicalHandoffs.length > 0 ? 'canonical' : (inferredHandoffs.length > 0 ? 'inferred' : 'missing'),
      latestDigest,
      latestHandoff,
      latestRoutingTelemetry: routingTelemetry,
      bestCurrentUnderstanding,
      guardrails: buildTaskGuardrails(
        task.needsClarification,
        budgetEvents,
        operatorActions.map((action) => ({
          actionType: action.action_type,
          detail: action.detail,
        })),
      ),
      limits: [
        `Agents assigned: ${task.agentCount}`,
        `Latest update: ${new Date(task.updatedAt).toLocaleString()}`,
      ],
    };
  } catch {
    return null;
  }
};

export const buildTaskHandoffs = (dependencies: string[], planDetails: string[]): string[] => {
  const handoffs = [
    ...dependencies.map((id) => `Depends on ${id}`),
    ...planDetails,
  ];
  return handoffs;
};

export const buildTaskGuardrails = (
  needsClarification: boolean,
  budgets: Array<{ detail: string; consumed: number }>,
  operatorActions: Array<{ actionType: string; detail: string }>,
): string[] => {
  const guardrails: string[] = [];
  if (needsClarification) {
    guardrails.push('Clarification requested by the creator.');
  }
  guardrails.push(...budgets.map((event) => `Budget: ${event.detail} (consumed ${event.consumed})`));
  guardrails.push(...operatorActions.map((action) => `Operator ${action.actionType}: ${action.detail}`));
  if (guardrails.length === 0) {
    guardrails.push('No guardrail events recorded yet.');
  }
  return guardrails;
};

export type TaskDispatchStatus = 'accepted' | 'queued' | 'offline';

type DispatchInput = {
  username: string;
  roomId?: string;
  messageType: 'chat' | 'status_update' | 'task_created';
  taskId?: string;
  payload: Record<string, unknown>;
  expectedMessageType?: string;
  expectedTaskId?: string;
};

type OperatorDispatcher = (input: DispatchInput) => Promise<TaskDispatchStatus>;

const defaultOperatorDispatcher: OperatorDispatcher = async (input) => {
  const operatorToken = process.env.DROIDSWARM_OPERATOR_TOKEN;
  dashboardLog('operator.dispatch.requested', {
    roomId: input.roomId ?? 'operator',
    messageType: input.messageType,
    taskId: input.taskId,
    username: input.username,
  });
  return await new Promise<TaskDispatchStatus>((resolve) => {
    const socket = new WebSocket(DEFAULT_SOCKET_URL);
    const connectionName = input.username;
    const messageId = randomUUID();
    const roomId = input.roomId ?? 'operator';
    let messageSent = false;
    const timeout = setTimeout(() => {
      socket.terminate();
      resolve(messageSent ? 'queued' : 'offline');
    }, 2_500);

    socket.on('open', () => {
      dashboardLog('socket.dispatch.connected', {
        roomId,
        messageType: input.messageType,
        taskId: input.taskId,
      });
      socket.send(JSON.stringify({
        type: 'auth',
        project_id: getProjectId(),
        timestamp: new Date().toISOString(),
        payload: {
          room_id: 'operator',
          agent_name: connectionName,
          agent_role: 'ui',
          client_type: 'dashboard',
          token: operatorToken,
        },
      }));
    });

    socket.on('message', (buffer) => {
      let parsed: {
        message_id?: string;
        type?: string;
        payload?: Record<string, unknown>;
      };
      try {
        parsed = JSON.parse(buffer.toString()) as {
          message_id?: string;
          type?: string;
          payload?: Record<string, unknown>;
        };
      } catch {
        return;
      }

      if (parsed.type === 'status_update' && typeof parsed.payload?.content === 'string' && parsed.payload.content.includes('Authenticated')) {
        messageSent = true;
        dashboardLog('socket.dispatch.authenticated', {
          roomId,
          messageType: input.messageType,
          taskId: input.taskId,
          messageId,
        });
        socket.send(JSON.stringify({
          message_id: messageId,
          project_id: getProjectId(),
          room_id: roomId,
          task_id: input.taskId,
          type: input.messageType,
          from: {
            actor_type: 'human',
            actor_id: input.username,
            actor_name: input.username,
          },
          timestamp: new Date().toISOString(),
          payload: input.payload,
        }));
        return;
      }

      if (input.expectedMessageType && parsed.type === input.expectedMessageType) {
        if (!input.expectedTaskId || parsed.payload?.task_id === input.expectedTaskId) {
          clearTimeout(timeout);
          socket.close();
          dashboardLog('socket.dispatch.acknowledged', {
            roomId,
            messageType: input.messageType,
            taskId: input.expectedTaskId ?? input.taskId,
            acknowledgementType: parsed.type,
          });
          resolve('accepted');
          return;
        }
      }

      if (parsed.message_id === messageId) {
        clearTimeout(timeout);
        socket.close();
        dashboardLog('socket.dispatch.echoed', {
          roomId,
          messageType: input.messageType,
          taskId: input.taskId,
          messageId,
        });
        resolve('accepted');
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      dashboardLog('socket.dispatch.error', {
        roomId,
        messageType: input.messageType,
        taskId: input.taskId,
        messageSent,
      });
      resolve(messageSent ? 'queued' : 'offline');
    });
  });
};

let operatorDispatcher: OperatorDispatcher = defaultOperatorDispatcher;

export const setOperatorDispatcher = (override: OperatorDispatcher): void => {
  operatorDispatcher = override;
};

export const resetOperatorDispatcher = (): void => {
  operatorDispatcher = defaultOperatorDispatcher;
};

export const dispatchOperatorMessage = (input: DispatchInput): Promise<TaskDispatchStatus> =>
  operatorDispatcher(input);

const publishOperatorStatusChange = async (input: {
  taskId: string;
  status: BoardStatus;
  username: string;
}): Promise<TaskDispatchStatus> => {
  return dispatchOperatorMessage({
    username: input.username,
    roomId: 'operator',
    taskId: input.taskId,
    messageType: 'status_update',
    payload: {
      status_code: input.status === 'cancelled' ? 'task_cancelled' : 'task_status_changed',
      phase: 'board',
      content: `Task moved to ${input.status}`,
      metadata: {
        task_id: input.taskId,
        status: input.status,
      },
    },
  });
};

const publishTaskCreated = async (task: TaskRecord): Promise<TaskDispatchStatus> => {
  return dispatchOperatorMessage({
    username: task.createdByUserId,
    roomId: 'operator',
    taskId: task.taskId,
    messageType: 'task_created',
    expectedMessageType: 'task_intake_accepted',
    expectedTaskId: task.taskId,
    payload: {
      task_id: task.taskId,
      title: task.title,
      description: task.description,
      task_type: task.taskType,
      priority: task.priority,
      created_by: task.createdByUserId,
    },
  });
};

export const sendOperatorInstruction = async (input: {
  username: string;
  content: string;
}): Promise<TaskDispatchStatus> => {
  return dispatchOperatorMessage({
    username: input.username,
    roomId: 'operator',
    messageType: 'chat',
    payload: {
      content: input.content,
      audience: 'orchestrator',
    },
  });
};

export type ChannelMessageResult = {
  dispatchStatus: TaskDispatchStatus;
  message: MessageRecord;
};

export const sendChannelMessage = async (input: {
  taskId: string;
  username: string;
  content: string;
}): Promise<ChannelMessageResult> => {
  dashboardLog('channel.message.requested', {
    taskId: input.taskId,
    username: input.username,
  });
  recordCanonicalTaskChat({
    taskId: input.taskId,
    source: 'dashboard',
    authorType: 'user',
    authorId: input.username,
    body: input.content,
  });

  const dispatchStatus = await dispatchOperatorMessage({
    username: input.username,
    roomId: input.taskId,
    taskId: input.taskId,
    messageType: 'chat',
    payload: {
      content: input.content,
      audience: 'task',
    },
  });

  const database = getDatabase();
  const createdAt = new Date().toISOString();
  const message: MessageRecord = {
    messageId: randomUUID(),
    projectId: getProjectId(),
    channelId: input.taskId,
    taskId: input.taskId,
    messageType: 'chat',
    senderType: 'human',
    senderName: input.username,
    content: input.content,
    payload: {
      content: input.content,
      dispatch_status: dispatchStatus,
    },
    createdAt,
  };

  database
    .prepare(`
      INSERT INTO messages (
        message_id, project_id, channel_id, task_id, message_type, sender_type,
        sender_id, sender_name, content, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      message.messageId,
      message.projectId,
      message.channelId,
      message.taskId,
      message.messageType,
      message.senderType,
      message.senderName,
      message.senderName,
      message.content,
      JSON.stringify(message.payload),
      message.createdAt,
    );

  dashboardLog('channel.message.persisted', {
    taskId: input.taskId,
    username: input.username,
    dispatchStatus,
    messageId: message.messageId,
  });

  return { dispatchStatus, message };
};

export const createTask = async (input: {
  title: string;
  description: string;
  taskType: TaskRecord['taskType'];
  priority: TaskRecord['priority'];
  username: string;
}): Promise<TaskRecord> => {
  const database = getDatabase();
  const now = new Date().toISOString();
  dashboardLog('task.create.requested', {
    title: input.title,
    taskType: input.taskType,
    priority: input.priority,
    username: input.username,
  });
  const task: TaskRecord = {
    taskId: randomUUID(),
    projectId: getProjectId(),
    title: input.title,
    description: input.description,
    taskType: input.taskType,
    priority: input.priority,
    status: 'todo',
    createdByUserId: input.username,
    createdByDisplayName: input.username,
    needsClarification: false,
    updatedAt: now,
    agentCount: 0,
  };

  database
    .prepare(`
      INSERT INTO task_events (
        event_id, project_id, task_id, event_type, actor_type, actor_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      randomUUID(),
      task.projectId,
      task.taskId,
      'task_created_local',
      'human',
      task.createdByUserId,
      JSON.stringify({
        title: task.title,
        description: task.description,
        task_type: task.taskType,
        priority: task.priority,
      }),
      now,
    );

  recordCanonicalTaskChat({
    taskId: task.taskId,
    source: 'dashboard',
    authorType: 'user',
    authorId: task.createdByUserId,
    body: `${task.title}\n\n${task.description}`,
    metadata: {
      priority: task.priority,
      task_type: task.taskType,
    },
  });

  const dispatchStatus = await publishTaskCreated(task);
  database
    .prepare(`
      INSERT INTO task_events (
        event_id, project_id, task_id, event_type, actor_type, actor_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      randomUUID(),
      task.projectId,
      task.taskId,
      dispatchStatus === 'accepted' ? 'task_dispatch_accepted' : dispatchStatus === 'queued' ? 'task_dispatch_queued' : 'task_dispatch_offline',
      'system',
      'dashboard',
      JSON.stringify({ dispatch_status: dispatchStatus }),
      new Date().toISOString(),
    );

  dashboardLog('task.create.persisted', {
    taskId: task.taskId,
    dispatchStatus,
    projectId: task.projectId,
  });

  return task;
};

export const updateTaskStatus = async (input: {
  taskId: string;
  status: BoardStatus;
  username: string;
}): Promise<void> => {
  const database = getDatabase();
  const now = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO task_events (
        event_id, project_id, task_id, event_type, actor_type, actor_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      randomUUID(),
      getProjectId(),
      input.taskId,
      input.status === 'cancelled' ? 'task_cancelled_local' : 'task_status_changed_local',
      'human',
      input.username,
      JSON.stringify({ status: input.status }),
      now,
    );

  const dispatchStatus = await publishOperatorStatusChange(input);
  database
    .prepare(`
      INSERT INTO task_events (
        event_id, project_id, task_id, event_type, actor_type, actor_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      randomUUID(),
      getProjectId(),
      input.taskId,
      dispatchStatus === 'offline' ? 'task_status_dispatch_offline' : 'task_status_dispatch_queued',
      'system',
      'dashboard',
      JSON.stringify({ status: input.status, dispatch_status: dispatchStatus }),
      new Date().toISOString(),
    );
};
