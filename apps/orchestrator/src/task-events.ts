import { randomUUID } from 'node:crypto';

import type { MessageEnvelope, TaskRecord } from './types';

export type TaskRelatedMessage = MessageEnvelope<'task_created' | 'task_intake_accepted' | 'status_update'>;
export type StatusUpdateMessage = MessageEnvelope<'status_update'>;

const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

export const resolveTaskFromMessage = (message: TaskRelatedMessage): TaskRecord | undefined => {
  const payload = message.payload as unknown as Record<string, unknown>;
  const metadata = typeof payload.metadata === 'object' && payload.metadata !== null
    ? (payload.metadata as Record<string, unknown>)
    : undefined;
  const taskId = message.task_id ?? asString(payload.task_id) ?? asString(metadata?.task_id);

  if (!taskId) {
    return undefined;
  }

  return {
    taskId,
    title: asString(payload.title) ?? taskId,
    description: asString(payload.description) ?? '',
    taskType: asString(payload.task_type) ?? 'task',
    priority: asString(payload.priority) ?? 'medium',
    createdByUserId: asString(payload.created_by) ?? asString(payload.created_by_user_id),
    createdAt: message.timestamp,
    branchName: asString(payload.branch_name),
  };
};

export const isCancellationMessage = (message: StatusUpdateMessage): boolean => {
  if (message.room_id !== 'operator') {
    return false;
  }

  const payload = message.payload as unknown as Record<string, unknown>;
  const statusCode = asString(payload.status_code) ?? '';
  const metadata = typeof payload.metadata === 'object' && payload.metadata !== null
    ? (payload.metadata as Record<string, unknown>)
    : undefined;

  return statusCode === 'task_cancelled' || metadata?.status === 'cancelled';
};

export const buildTaskCancellationAcknowledged = (
  projectId: string,
  orchestratorName: string,
  taskId: string,
  removedAgents: string[],
): MessageEnvelope<'status_update'> => ({
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
