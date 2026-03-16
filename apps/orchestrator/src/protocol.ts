import { randomUUID } from 'node:crypto';

import type { AuthMessage, ClientType, MessageEnvelope, OrchestratorConfig } from './types';
import { messageEnvelopeSchema } from '../../../libs/protocol/src';

export const parseEnvelope = (raw: string): MessageEnvelope =>
  messageEnvelopeSchema.parse(JSON.parse(raw));

const nowIso = (): string => new Date().toISOString();

export const buildAuthMessage = (config: OrchestratorConfig): AuthMessage =>
  buildRoomAuthMessage(config, 'operator', config.agentName, 'orchestrator', config.agentRole);

export const buildRoomAuthMessage = (
  config: OrchestratorConfig,
  roomId: string,
  agentName: string,
  clientType: ClientType,
  agentRole = config.agentRole,
): AuthMessage => ({
  type: 'auth',
  project_id: config.projectId,
  timestamp: nowIso(),
  payload: {
    room_id: roomId,
    agent_name: agentName,
    agent_role: agentRole,
    client_type: clientType,
    token: roomId === 'operator' ? config.operatorToken : undefined,
  },
});

export const buildHeartbeatMessage = (config: OrchestratorConfig): MessageEnvelope =>
  buildRoomHeartbeatMessage(config, 'operator', config.agentName);

export const buildRoomHeartbeatMessage = (
  config: OrchestratorConfig,
  roomId: string,
  agentName: string,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  type: 'heartbeat',
  from: {
    actor_type: 'orchestrator',
    actor_id: agentName,
    actor_name: agentName,
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
