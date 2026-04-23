import '../../../packages/protocol-alias/src/index';
import { randomUUID } from 'node:crypto';

import type { AuthMessage, ClientType, MessageEnvelope, OrchestratorConfig } from './types';
import { normalizeEnvelopeV2 } from '@protocol';
import { isEnvelopeV2, normalizeToEnvelopeV2, type EnvelopeV2 } from '@shared-types';

export const parseCanonicalEnvelope = (raw: string): EnvelopeV2 =>
  normalizeToEnvelopeV2(JSON.parse(raw));

export const parseEnvelope = (raw: string): MessageEnvelope => {
  const parsed = JSON.parse(raw);
  const canonical = normalizeToEnvelopeV2(parsed);
  return isEnvelopeV2(parsed)
    ? canonicalEnvelopeToMessage(canonical)
    : normalizeEnvelopeV2(parsed);
};

const typeByVerb: Record<EnvelopeV2['verb'], MessageEnvelope['type']> = {
  'task.create': 'task_created',
  'task.accept': 'task_intake_accepted',
  'task.ready': 'task_assigned',
  'task.blocked': 'clarification_request',
  'plan.proposed': 'plan_proposed',
  'spawn.requested': 'spawn_requested',
  'spawn.approved': 'spawn_approved',
  'spawn.denied': 'spawn_denied',
  'artifact.created': 'artifact_created',
  'checkpoint.created': 'checkpoint_created',
  'verification.requested': 'verification_requested',
  'verification.completed': 'verification_completed',
  'run.completed': 'run_completed',
  'handoff.ready': 'handoff_event',
  'summary.emitted': 'guardrail_event',
  'memory.pinned': 'checkpoint_event',
  'drift.detected': 'trace_event',
  'status.updated': 'status_update',
  'tool.request': 'tool_request',
  'tool.response': 'tool_response',
  'chat.message': 'chat',
  heartbeat: 'heartbeat',
};

const canonicalEnvelopeToMessage = (canonical: EnvelopeV2): MessageEnvelope => ({
  id: canonical.id,
  message_id: canonical.id,
  ts: canonical.ts,
  project_id: canonical.project_id,
  swarm_id: canonical.swarm_id,
  run_id: canonical.run_id,
  room_id: canonical.room_id,
  task_id: canonical.task_id,
  agent_id: canonical.agent_id,
  role: canonical.role,
  verb: canonical.verb,
  depends_on: canonical.depends_on,
  artifact_refs: canonical.artifact_refs,
  memory_refs: canonical.memory_refs,
  risk: canonical.risk,
  body: canonical.body,
  type: typeByVerb[canonical.verb],
  from: {
    actor_type: 'agent',
    actor_id: canonical.agent_id ?? canonical.role ?? 'unknown-agent',
    actor_name: canonical.role ?? canonical.agent_id ?? 'unknown-agent',
  },
  timestamp: canonical.ts,
  payload: canonical.body as MessageEnvelope['payload'],
} as MessageEnvelope);

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
): MessageEnvelope => {
  const id = randomUUID();
  const ts = nowIso();
  return {
  id,
  message_id: id,
  project_id: config.projectId,
  room_id: roomId,
  type: 'heartbeat',
  from: {
    actor_type: 'orchestrator',
    actor_id: agentName,
    actor_name: agentName,
  },
  ts,
  timestamp: ts,
  agent_id: agentName,
  role: config.agentRole,
  verb: 'heartbeat',
  body: {},
  payload: {},
  };
};

export const buildTaskIntakeAccepted = (
  config: OrchestratorConfig,
  taskId: string,
): MessageEnvelope => {
  const id = randomUUID();
  const ts = nowIso();
  return {
  id,
  message_id: id,
  project_id: config.projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'task_intake_accepted',
  from: {
    actor_type: 'orchestrator',
    actor_id: config.agentName,
    actor_name: config.agentName,
  },
  ts,
  timestamp: ts,
  agent_id: config.agentName,
  role: config.agentRole,
  verb: 'task.accept',
  body: {
    task_id: taskId,
    accepted: true,
    next_status: 'planning',
    content: 'Task intake accepted by orchestrator.',
  },
  payload: {
    task_id: taskId,
    accepted: true,
    next_status: 'planning',
    content: 'Task intake accepted by orchestrator.',
  },
  };
};
