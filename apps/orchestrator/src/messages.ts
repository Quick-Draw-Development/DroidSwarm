import { randomUUID } from 'node:crypto';
import type { UsageShape } from '@protocol';

import type {
  EnvelopeVerb,
  MessageEnvelope,
  OrchestratorConfig,
  RequestedAgent,
  SpawnedAgent,
  ToolRequestPayload,
  ToolResponsePayload,
  WorkerArtifact,
} from './types';

const nowIso = (): string => new Date().toISOString();

const buildActor = (name: string, actorType: 'agent' | 'orchestrator'): MessageEnvelope['from'] => ({
  actor_type: actorType,
  actor_id: name,
  actor_name: name,
});

const buildEnvelope = <T extends MessageEnvelope['type']>(input: {
  config: OrchestratorConfig;
  roomId: string;
  type: T;
  from: MessageEnvelope['from'];
  payload: MessageEnvelope<T>['payload'];
  taskId?: string;
  verb: EnvelopeVerb;
  body?: Record<string, unknown>;
  artifactRefs?: string[];
  memoryRefs?: string[];
  dependsOn?: string[];
  compression?: MessageEnvelope['compression'];
  usage?: UsageShape;
}): MessageEnvelope<T> => {
  const id = randomUUID();
  const ts = nowIso();
  return {
    id,
    message_id: id,
    ts,
    project_id: input.config.projectId,
    room_id: input.roomId,
    task_id: input.taskId,
    agent_id: input.from.actor_id,
    role: input.from.actor_name,
    verb: input.verb,
    depends_on: input.dependsOn,
    artifact_refs: input.artifactRefs,
    memory_refs: input.memoryRefs,
    body: input.body ?? (input.payload as Record<string, unknown>),
    type: input.type,
    from: input.from,
    timestamp: ts,
    payload: input.payload,
    compression: input.compression,
    usage: input.usage,
  } as MessageEnvelope<T>;
};

export const buildAgentStatusUpdate = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  agentName: string,
  phase: string,
  statusCode: string,
  content: string,
  compression?: MessageEnvelope['compression'],
  payloadExtras?: Record<string, unknown>,
): MessageEnvelope<'status_update'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'status_update',
  from: buildActor(agentName, 'agent'),
  verb: 'status.updated',
  payload: {
    phase,
    status_code: statusCode,
    content,
    ...payloadExtras,
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
): MessageEnvelope<'status_update'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'status_update',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'status.updated',
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
  artifact: WorkerArtifact,
): MessageEnvelope<'artifact_created'> => {
  const artifactId = randomUUID();
  return buildEnvelope({
    config,
    roomId,
    taskId,
    type: 'artifact_created',
    from: buildActor(agentName, 'agent'),
    verb: 'artifact.created',
    artifactRefs: [artifactId],
    payload: {
      artifact_id: artifactId,
      task_id: taskId,
      kind: artifact.kind,
      summary: artifact.summary,
      content: artifact.content ?? artifact.path ?? artifact.uri ?? artifact.summary,
    },
  });
};

export const buildSpawnRequestedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  agentName: string,
  request: RequestedAgent,
): MessageEnvelope<'spawn_requested'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'spawn_requested',
  from: buildActor(agentName, 'agent'),
  verb: 'spawn.requested',
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
): MessageEnvelope<'task_assigned'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'task_assigned',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'task.ready',
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
): MessageEnvelope<'clarification_request'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'clarification_request',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'task.blocked',
  payload: {
    target_user_id: targetUserId,
    question,
    content: targetUserId ? `@${targetUserId} ${question}` : question,
  },
});

export const buildAgentToolResponseMessage = (
  config: OrchestratorConfig,
  taskId: string,
  roomId: string,
  agentName: string,
  payload: ToolResponsePayload,
  usage?: UsageShape,
): MessageEnvelope<'tool_response'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'tool_response',
  from: buildActor(agentName, 'agent'),
  verb: 'tool.response',
  payload,
  usage,
});

export const buildOperatorChatResponse = (
  config: OrchestratorConfig,
  content: string,
): MessageEnvelope<'chat'> => buildEnvelope({
  config,
  roomId: 'operator',
  type: 'chat',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'chat.message',
  payload: { content },
});

export const buildPlanProposedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  planId: string,
  summary: string,
  plan?: string,
  dependencies?: string[],
): MessageEnvelope<'plan_proposed'> => buildEnvelope({
  config,
  roomId: 'operator',
  taskId,
  type: 'plan_proposed',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'plan.proposed',
  dependsOn: dependencies,
  payload: {
    task_id: taskId,
    plan_id: planId,
    summary,
    plan,
    dependencies,
  },
});

export const buildToolRequestMessage = (
  config: OrchestratorConfig,
  taskId: string,
  agentName: string,
  payload: ToolRequestPayload,
): MessageEnvelope<'tool_request'> => buildEnvelope({
  config,
  roomId: taskId,
  taskId,
  type: 'tool_request',
  from: buildActor(agentName, 'agent'),
  verb: 'tool.request',
  payload,
  body: payload as unknown as Record<string, unknown>,
});

export const buildToolResponseMessage = (
  config: OrchestratorConfig,
  taskId: string,
  requestId: string,
  status: ToolResponsePayload['status'],
  result?: ToolResponsePayload['result'],
  error?: string,
): MessageEnvelope<'tool_response'> => buildEnvelope({
  config,
  roomId: taskId,
  taskId,
  type: 'tool_response',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'tool.response',
  payload: {
    request_id: requestId,
    status,
    result,
    error,
  },
});

export const buildVerificationRequestedMessage = (
  config: OrchestratorConfig,
  taskId: string,
  verificationType: string,
  requestedBy: string,
  detail?: string,
): MessageEnvelope<'verification_requested'> => buildEnvelope({
  config,
  roomId: 'operator',
  taskId,
  type: 'verification_requested',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'verification.requested',
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
): MessageEnvelope<'verification_completed'> => buildEnvelope({
  config,
  roomId: 'operator',
  taskId,
  type: 'verification_completed',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'verification.completed',
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
): MessageEnvelope<'checkpoint_created'> => buildEnvelope({
  config,
  roomId,
  taskId,
  type: 'checkpoint_created',
  from: buildActor(config.agentName, 'orchestrator'),
  verb: 'checkpoint.created',
  memoryRefs: [checkpointId],
  payload: {
    checkpoint_id: checkpointId,
    task_id: taskId,
    summary,
    metadata,
  },
});
