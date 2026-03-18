import { randomUUID } from 'node:crypto';

import type { ConnectedClient, MessageEnvelope, MessagePayloadMap, MessageType } from '../types';

const nowIso = (): string => new Date().toISOString();

export const buildSystemMessage = <T extends MessageType>(
  projectId: string,
  roomId: string,
  type: T,
  payload: MessagePayloadMap[T],
): MessageEnvelope<T> => ({
  message_id: randomUUID(),
  project_id: projectId,
  room_id: roomId,
  type,
  from: {
    actor_type: 'system',
    actor_id: 'system',
    actor_name: 'System',
  },
  timestamp: nowIso(),
  payload,
}) as MessageEnvelope<T>;

export const buildAuthSuccessMessage = (
  projectId: string,
  client: ConnectedClient,
): MessageEnvelope => buildSystemMessage(projectId, client.roomId, 'status_update', {
  status_code: 'ready',
  phase: 'auth',
  content: `Authenticated ${client.agentName}`,
});

export const buildErrorMessage = (
  projectId: string,
  roomId: string,
  content: string,
  reasonCode: string,
): MessageEnvelope => buildSystemMessage(projectId, roomId, 'guardrail_event', {
  guardrail_name: 'socket_protocol',
  phase: 'input',
  result: 'fail',
  details: {
    reason_code: reasonCode,
  },
  content,
});
