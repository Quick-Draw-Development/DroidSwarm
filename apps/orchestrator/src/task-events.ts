import { randomUUID } from 'node:crypto';

import type { MessageEnvelope, TaskRecord } from './types';

export const resolveTaskFromMessage = (message: MessageEnvelope): TaskRecord | undefined => {
  const taskId = message.task_id ?? (typeof message.payload.task_id === 'string' ? message.payload.task_id : undefined);
  if (!taskId) {
    return undefined;
  }

  return {
    taskId,
    title: typeof message.payload.title === 'string' ? message.payload.title : taskId,
    description: typeof message.payload.description === 'string' ? message.payload.description : '',
    taskType: typeof message.payload.task_type === 'string' ? message.payload.task_type : 'task',
    priority: typeof message.payload.priority === 'string' ? message.payload.priority : 'medium',
    createdByUserId: typeof message.payload.created_by === 'string'
      ? message.payload.created_by
      : typeof message.payload.created_by_user_id === 'string'
        ? message.payload.created_by_user_id
        : undefined,
    createdAt: message.timestamp,
    branchName: typeof message.payload.branch_name === 'string' ? message.payload.branch_name : undefined,
  };
};

export const isCancellationMessage = (message: MessageEnvelope): boolean => {
  if (message.type !== 'status_update' || message.room_id !== 'operator') {
    return false;
  }

  const statusCode = typeof message.payload.status_code === 'string' ? message.payload.status_code : '';
  const metadata = typeof message.payload.metadata === 'object' && message.payload.metadata !== null
    ? (message.payload.metadata as Record<string, unknown>)
    : undefined;

  return statusCode === 'task_cancelled' || metadata?.status === 'cancelled';
};

export const buildTaskCancellationAcknowledged = (
  projectId: string,
  orchestratorName: string,
  taskId: string,
  removedAgents: string[],
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'status_update',
  from: {
    actor_type: 'orchestrator',
    actor_id: orchestratorName,
    actor_name: orchestratorName,
  },
  timestamp: new Date().toISOString(),
  payload: {
    status_code: 'task_cancellation_acknowledged',
    phase: 'cancelled',
    metadata: {
      status: 'cancelled',
      removed_agents: removedAgents,
      removed_agent_count: removedAgents.length,
    },
    content: removedAgents.length > 0
      ? `Cancelled task and removed ${removedAgents.length} active agents.`
      : 'Cancelled task and cleared agent assignments.',
  },
});
