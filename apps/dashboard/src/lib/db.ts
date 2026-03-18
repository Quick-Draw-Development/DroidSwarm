import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';
import WebSocket from 'ws';

import type {
  ArtifactSummary,
  AgentAssignmentSummary,
  BoardStatus,
  BudgetEventSummary,
  CheckpointSummary,
  DependencySummary,
  MessageRecord,
  ProjectIdentity,
  RunSummary,
  RunTimelineEntry,
  TaskDetails,
  TaskNode,
  TaskRecord,
  VerificationTaskSummary,
} from './types';

const DEFAULT_PROJECT_ID = process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm';
const DEFAULT_PROJECT_NAME = process.env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm';
const DEFAULT_DB_PATH = process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db');
const DEFAULT_SOCKET_URL = process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765';
const DEFAULT_ORCHESTRATOR_NAME = process.env.DROIDSWARM_ORCHESTRATOR_NAME ?? 'Orchestrator';

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
  databaseInstance = new Database(DEFAULT_DB_PATH);
  ensureDashboardSchema(databaseInstance);
  return databaseInstance;
};

const ensureDashboardSchema = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      task_id TEXT,
      message_type TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT,
      payload_json TEXT NOT NULL,
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
  `);
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

export const getProjectIdentity = (): ProjectIdentity => ({
  projectId: DEFAULT_PROJECT_ID,
  projectName: DEFAULT_PROJECT_NAME,
});

export const listOperatorMessages = (): MessageRecord[] => {
  try {
    const database = getDatabase();
    const rows = database
      .prepare('SELECT * FROM messages WHERE channel_id = ? AND project_id = ? ORDER BY created_at ASC LIMIT 200')
      .all('operator', DEFAULT_PROJECT_ID) as Record<string, unknown>[];

    return rows.map(mapMessageRecord);
  } catch {
    return [];
  }
};

export const listRuns = (): RunSummary[] => {
  try {
    const database = getDatabase();
    const rows = database
      .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC')
      .all(DEFAULT_PROJECT_ID) as Array<{
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
      .get(taskId, DEFAULT_PROJECT_ID) as Record<string, unknown> | undefined;

    if (!taskRow) {
      return null;
    }

    const rawRow = taskRow as BoardTaskRow;
    const task = buildTaskRecordFromRow(rawRow, countAgentsForTask(database, taskId));
    const messages = (
      database
        .prepare('SELECT * FROM messages WHERE task_id = ? AND project_id = ? ORDER BY created_at ASC')
        .all(taskId, DEFAULT_PROJECT_ID) as Record<string, unknown>[]
    ).map(mapMessageRecord);

    const activeAgents = task.status === 'cancelled' ? [] : buildActiveAgents(database, taskId);

    return {
      task,
      messages,
      activeAgents,
      handoffs: ['Planner-Alpha -> Architect-Beta: planning summary attached'],
      guardrails: [
        task.status === 'cancelled'
          ? 'Task cancelled. Orchestrator should stop and remove assigned agents.'
          : task.needsClarification
            ? 'Waiting on creator clarification before branch creation'
            : `Current stage: ${task.stage ?? 'planning'}`,
        `Priority guardrails: ${task.priority}`,
      ],
      limits: [
        `Agents assigned: ${task.agentCount}`,
        `Latest update: ${new Date(task.updatedAt).toLocaleString()}`,
      ],
    };
  } catch {
    return null;
  }
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
  console.log('Dispatching operator message with input:', input);
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
      socket.send(JSON.stringify({
        type: 'auth',
        project_id: DEFAULT_PROJECT_ID,
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
        socket.send(JSON.stringify({
          message_id: messageId,
          project_id: DEFAULT_PROJECT_ID,
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
          resolve('accepted');
          return;
        }
      }

      if (parsed.message_id === messageId) {
        clearTimeout(timeout);
        socket.close();
        resolve('accepted');
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
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
}): Promise<TaskDispatchStatus> => dispatchOperatorMessage({
  username: input.username,
  roomId: 'operator',
  messageType: 'chat',
  payload: {
    content: input.content,
    audience: 'orchestrator',
  },
});

export type ChannelMessageResult = {
  dispatchStatus: TaskDispatchStatus;
  message: MessageRecord;
};

export const sendChannelMessage = async (input: {
  taskId: string;
  username: string;
  content: string;
}): Promise<ChannelMessageResult> => {
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
    projectId: DEFAULT_PROJECT_ID,
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
        sender_name, content, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      message.messageId,
      message.projectId,
      message.channelId,
      message.taskId,
      message.messageType,
      message.senderType,
      message.senderName,
      message.content,
      JSON.stringify(message.payload),
      message.createdAt,
    );

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
  const task: TaskRecord = {
    taskId: randomUUID(),
    projectId: DEFAULT_PROJECT_ID,
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
      DEFAULT_PROJECT_ID,
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
      DEFAULT_PROJECT_ID,
      input.taskId,
      dispatchStatus === 'offline' ? 'task_status_dispatch_offline' : 'task_status_dispatch_queued',
      'system',
      'dashboard',
      JSON.stringify({ status: input.status, dispatch_status: dispatchStatus }),
      new Date().toISOString(),
    );
};
