import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';
import WebSocket from 'ws';

import type { BoardStatus, MessageRecord, ProjectIdentity, TaskDetails, TaskRecord } from './types';

const DEFAULT_PROJECT_ID = process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm';
const DEFAULT_PROJECT_NAME = process.env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm';
const DEFAULT_DB_PATH = process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db');
const DEFAULT_SOCKET_URL = process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765';
const DEFAULT_ORCHESTRATOR_NAME = process.env.DROIDSWARM_ORCHESTRATOR_NAME ?? 'Orchestrator';

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

    CREATE TABLE IF NOT EXISTS channels (
      channel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      channel_type TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

const parsePayload = (payloadJson: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(payloadJson);
    return typeof parsed === 'object' && parsed !== null && 'payload' in parsed
      ? (parsed.payload as Record<string, unknown>)
      : parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const buildActiveAgents = (database: Database.Database, taskId: string): TaskDetails['activeAgents'] => {
  const now = new Date().toISOString();
  const rows = database
    .prepare(`
      SELECT payload_json, created_at
      FROM messages
      WHERE project_id = ?
        AND task_id = ?
        AND message_type = 'status_update'
      ORDER BY created_at DESC
      LIMIT 20
    `)
    .all(DEFAULT_PROJECT_ID, taskId) as Array<{ payload_json: string }>;

  for (const row of rows) {
    const payload = parsePayload(row.payload_json);
    if (!payload) {
      continue;
    }

    if (payload.status_code !== 'agent_assigned') {
      continue;
    }

    const assigned = payload.assigned_agents;
    if (!Array.isArray(assigned)) {
      continue;
    }

    const agents = assigned.flatMap((entry) => {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.agent_name === 'string'
      ) {
        return [{
          name: entry.agent_name,
          role: typeof entry.agent_role === 'string' ? entry.agent_role : 'agent',
          lastSeenAt: now,
        }];
      }
      return [];
    });

    if (agents.length > 0) {
      if (!agents.some((agent) => agent.name === DEFAULT_ORCHESTRATOR_NAME)) {
        agents.push({
          name: DEFAULT_ORCHESTRATOR_NAME,
          role: 'orchestrator',
          lastSeenAt: now,
        });
      }
      return agents;
    }
  }

  return [{
    name: DEFAULT_ORCHESTRATOR_NAME,
    role: 'orchestrator',
    lastSeenAt: now,
  }];
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

export const listTasks = (): TaskRecord[] => {
  try {
    const database = getDatabase();
    const rows = database
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC')
      .all(DEFAULT_PROJECT_ID) as Record<string, unknown>[];

    return rows.map(mapTaskRecord);
  } catch {
    return [];
  }
};

export const getTaskDetails = (taskId: string): TaskDetails | null => {
  try {
    const database = getDatabase();
    const taskRow = database
      .prepare('SELECT * FROM tasks WHERE task_id = ? AND project_id = ?')
      .get(taskId, DEFAULT_PROJECT_ID) as Record<string, unknown> | undefined;

    if (!taskRow) {
      return null;
    }

    const task = mapTaskRecord(taskRow);
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
      guardrails: task.status === 'cancelled'
        ? ['Task cancelled. Orchestrator should stop and remove assigned agents.']
        : task.needsClarification
          ? ['Waiting on creator clarification before branch creation']
          : ['Branch policy check passed'],
      limits: ['Context pressure normal', 'No current rate-limit backoff'],
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
      INSERT INTO tasks (
        task_id, project_id, title, description, task_type, priority, status,
        created_by_user_id, created_by_display_name, needs_clarification, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      task.taskId,
      task.projectId,
      task.title,
      task.description,
      task.taskType,
      task.priority,
      task.status,
      task.createdByUserId,
      task.createdByDisplayName,
      0,
      task.updatedAt,
    );

  database
    .prepare(`
      INSERT OR REPLACE INTO channels (
        channel_id, project_id, task_id, channel_type, name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(task.taskId, task.projectId, task.taskId, 'task', task.taskId, 'active', now, now);

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
      UPDATE tasks
      SET status = ?, updated_at = ?, blocked_reason = CASE WHEN ? = 'cancelled' THEN 'Cancelled from board' ELSE NULL END
      WHERE task_id = ? AND project_id = ?
    `)
    .run(input.status, now, input.status, input.taskId, DEFAULT_PROJECT_ID);

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
