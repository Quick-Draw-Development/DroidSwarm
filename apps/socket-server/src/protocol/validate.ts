import { authMessageSchema, normalizeEnvelopeV2, type AuthMessage, type MessageEnvelope, type MessageType } from '@protocol';
import { isEnvelopeV2, normalizeToEnvelopeV2, type EnvelopeV2 } from '@shared-types';

export const parseAuthMessage = (input: string): AuthMessage => authMessageSchema.parse(JSON.parse(input));

export const parseCanonicalEnvelope = (input: string): EnvelopeV2 => normalizeToEnvelopeV2(JSON.parse(input));

export const parseMessageEnvelope = (input: string): MessageEnvelope => normalizeEnvelopeV2(JSON.parse(input));

export const parseIncomingEnvelope = (input: string): { canonical: EnvelopeV2; message: MessageEnvelope } => {
  const parsed = JSON.parse(input);
  const canonical = normalizeToEnvelopeV2(parsed);
  return {
    canonical,
    message: isEnvelopeV2(parsed) ? canonicalEnvelopeToMessage(parsed, canonical) : normalizeEnvelopeV2(parsed),
  };
};

export const isOperatorOnlyMessage = (type: MessageType): boolean =>
  type === 'task_created' || type === 'task_intake_accepted';

const typeByVerb: Record<EnvelopeV2['verb'], MessageType> = {
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
  'status.updated': 'status_update',
  'tool.request': 'tool_request',
  'tool.response': 'tool_response',
  'chat.message': 'chat',
  heartbeat: 'heartbeat',
};

const canonicalEnvelopeToMessage = (raw: unknown, canonical: EnvelopeV2): MessageEnvelope => {
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  return {
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
    reply_to: typeof record.reply_to === 'string' ? record.reply_to : undefined,
    trace_id: typeof record.trace_id === 'string' ? record.trace_id : undefined,
    span_id: typeof record.span_id === 'string' ? record.span_id : undefined,
    session_id: typeof record.session_id === 'string' ? record.session_id : undefined,
  } as MessageEnvelope;
};
