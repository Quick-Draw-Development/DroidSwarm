import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { AuthMessage, MessageEnvelope, OrchestratorConfig } from './types';

const isoTimestampSchema = z.string().datetime({ offset: true });

const actorRefSchema = z.object({
  actor_type: z.enum(['agent', 'orchestrator', 'human', 'system', 'tool']),
  actor_id: z.string().min(1),
  actor_name: z.string().min(1),
});

export const messageEnvelopeSchema = z.object({
  message_id: z.string().min(1),
  project_id: z.string().min(1),
  room_id: z.string().min(1),
  task_id: z.string().min(1).optional(),
  type: z.enum(['status_update', 'task_created', 'task_intake_accepted', 'chat', 'heartbeat']),
  from: actorRefSchema,
  timestamp: isoTimestampSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const parseEnvelope = (raw: string): MessageEnvelope => messageEnvelopeSchema.parse(JSON.parse(raw));

const nowIso = (): string => new Date().toISOString();

export const buildAuthMessage = (config: OrchestratorConfig): AuthMessage => ({
  type: 'auth',
  project_id: config.projectId,
  timestamp: nowIso(),
  payload: {
    room_id: 'operator',
    agent_name: config.agentName,
    agent_role: config.agentRole,
    client_type: 'orchestrator',
    token: config.operatorToken,
  },
});

export const buildHeartbeatMessage = (config: OrchestratorConfig): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: 'operator',
  type: 'heartbeat',
  from: {
    actor_type: 'orchestrator',
    actor_id: config.agentName,
    actor_name: config.agentName,
  },
  timestamp: nowIso(),
  payload: {},
});

export const buildTaskIntakeAccepted = (
  config: OrchestratorConfig,
  taskId: string,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'task_intake_accepted',
  from: {
    actor_type: 'orchestrator',
    actor_id: config.agentName,
    actor_name: config.agentName,
  },
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    accepted: true,
    next_status: 'planning',
    content: 'Task intake accepted by orchestrator.',
  },
});
