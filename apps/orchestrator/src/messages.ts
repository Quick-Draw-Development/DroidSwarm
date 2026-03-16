import { randomUUID } from 'node:crypto';

import type { CodexAgentResult, MessageEnvelope, OrchestratorConfig, RequestedAgent } from './types';

const nowIso = (): string => new Date().toISOString();

const buildActor = (name: string, actorType: 'agent' | 'orchestrator'): MessageEnvelope['from'] => ({
  actor_type: actorType,
  actor_id: name,
  actor_name: name,
});

export const buildAgentStatusUpdate = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  agentName: string,
  phase: string,
  statusCode: string,
  content: string,
  compression?: MessageEnvelope['compression'],
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'status_update',
  from: buildActor(agentName, 'agent'),
  timestamp: nowIso(),
  payload: {
    phase,
    status_code: statusCode,
    content,
  },
  compression,
});

export const buildOrchestratorStatusUpdate = (
  config: OrchestratorConfig,
  roomId: string,
  phase: string,
  statusCode: string,
  content: string,
  taskId?: string,
  extraPayload?: Record<string, unknown>,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'status_update',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    phase,
    status_code: statusCode,
    content,
    ...extraPayload,
  },
});

export const buildAgentArtifactMessage = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  agentName: string,
  artifact: CodexAgentResult['artifacts'][number],
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'artifact',
  from: buildActor(agentName, 'agent'),
  timestamp: nowIso(),
  payload: {
    artifact_kind: artifact.kind,
    title: artifact.title,
    content: artifact.content,
  },
});

export const buildAgentRequestHelp = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  agentName: string,
  request: RequestedAgent,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'request_help',
  from: buildActor(agentName, 'agent'),
  timestamp: nowIso(),
  payload: {
    needed_role: request.role,
    reason_code: request.reason,
    instructions: request.instructions,
    content: `Need ${request.role}: ${request.reason}`,
  },
});

export const buildClarificationRequest = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  targetUserId: string | undefined,
  question: string,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'clarification_request',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    target_user_id: targetUserId,
    question,
    content: targetUserId ? `@${targetUserId} ${question}` : question,
  },
});

export const buildOperatorChatResponse = (
  config: OrchestratorConfig,
  content: string,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: 'operator',
  type: 'chat',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    content,
  },
});
