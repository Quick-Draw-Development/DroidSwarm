import { randomUUID } from 'node:crypto';

import type {
  CodexAgentResult,
  MessageEnvelope,
  OrchestratorConfig,
  RequestedAgent,
  SpawnedAgent,
} from './types';

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

export const buildArtifactCreatedMessage = (
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
  type: 'artifact_created',
  from: buildActor(agentName, 'agent'),
  timestamp: nowIso(),
  payload: {
    artifact_id: randomUUID(),
    task_id: taskId,
    kind: artifact.kind,
    summary: artifact.title,
    content: artifact.content,
  },
});

export const buildSpawnRequestedMessage = (
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
  type: 'spawn_requested',
  from: buildActor(agentName, 'agent'),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    needed_role: request.role,
    reason_code: request.reason,
    instructions: request.instructions,
    content: `Need ${request.role}: ${request.reason}`,
  },
});

export const buildTaskAssignedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  assignmentId: string,
  agents: SpawnedAgent[],
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'task_assigned',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    assignment_id: assignmentId,
    assigned_agents: agents.map((agent) => ({
      agent_name: agent.agentName,
      agent_role: agent.role,
      attempt_id: agent.attemptId,
    })),
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

export const buildPlanProposedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  planId: string,
  summary: string,
  plan?: string,
  dependencies?: string[],
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'plan_proposed',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    plan_id: planId,
    summary,
    plan,
    dependencies,
  },
});

export const buildVerificationRequestedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  verificationType: string,
  requestedBy: string,
  detail?: string,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'verification_requested',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    verification_type: verificationType,
    requested_by: requestedBy,
    detail,
  },
});

export const buildVerificationCompletedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  stage: 'verification' | 'review',
  status: 'passed' | 'failed' | 'blocked',
  reviewer: string,
  details?: string,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'verification_completed',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    status,
    reviewer,
    details: [`stage=${stage}`, details].filter(Boolean).join(' | '),
  },
});

export const buildCheckpointCreatedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  checkpointId: string,
  summary: string,
  metadata?: Record<string, unknown>,
): MessageEnvelope => ({
  message_id: randomUUID(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: 'checkpoint_created',
  from: buildActor(config.agentName, 'orchestrator'),
  timestamp: nowIso(),
  payload: {
    checkpoint_id: checkpointId,
    task_id: taskId,
    summary,
    metadata,
  },
});
