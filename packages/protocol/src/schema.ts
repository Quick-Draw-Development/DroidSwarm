import { z } from 'zod';

import type {
  AuthMessage,
  AuthPayload,
  MessageEnvelope,
  MessagePayloadMap,
  MessageType,
} from './types';

const isoTimestampSchema = z.string().datetime({ offset: true });

const actorTypeEnum = z.enum(['agent', 'orchestrator', 'human', 'system', 'tool'] as const);
const actorRefSchema = z.object({
  actor_type: actorTypeEnum,
  actor_id: z.string().min(1),
  actor_name: z.string().min(1),
});

const compressionSchema = z.object({
  scheme: z.string().min(1),
  compressed_content: z.string().min(1),
});

const usageSchema = z.object({
  total_tokens: z.number().int().nonnegative().optional(),
  input_tokens: z.number().int().nonnegative().optional(),
  cached_input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  reasoning_output_tokens: z.number().int().nonnegative().optional(),
});

const baseEnvelopeSchema = z.object({
  message_id: z.string().min(1),
  project_id: z.string().min(1),
  room_id: z.string().min(1),
  task_id: z.string().min(1).optional(),
  from: actorRefSchema,
  timestamp: isoTimestampSchema,
  reply_to: z.string().min(1).optional(),
  trace_id: z.string().min(1).optional(),
  span_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  usage: usageSchema.optional(),
  compression: compressionSchema.optional(),
});

const statusUpdatePayloadSchema = z.object({
  phase: z.string().min(1),
  status_code: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const taskCreatedPayloadSchema = z.object({
  task_id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  task_type: z.string().optional(),
  priority: z.string().optional(),
  created_by: z.string().optional(),
  created_by_user_id: z.string().optional(),
  branch_name: z.string().optional(),
});

const taskIntakeAcceptedPayloadSchema = z.object({
  task_id: z.string().min(1),
  accepted: z.boolean(),
  next_status: z.string().optional(),
  content: z.string().optional(),
});

const chatPayloadSchema = z.object({
  content: z.string().min(1),
});

const heartbeatPayloadSchema = z.object({});

const requestHelpPayloadSchema = z.object({
  task_id: z.string().min(1).optional(),
  needed_role: z.string().min(1),
  reason_code: z.string().min(1),
  instructions: z.string().min(1),
  content: z.string().min(1),
});

const artifactPayloadSchema = z.object({
  artifact_kind: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
});

const artifactCreatedPayloadSchema = z.object({
  artifact_id: z.string().min(1),
  task_id: z.string().min(1),
  kind: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const clarificationRequestPayloadSchema = z.object({
  target_user_id: z.string().min(1).optional(),
  question: z.string().min(1),
  content: z.string().min(1),
  question_id: z.string().min(1).optional(),
  reason_code: z.string().min(1).optional(),
});

const planProposedPayloadSchema = z.object({
  task_id: z.string().min(1),
  plan_id: z.string().min(1),
  summary: z.string().min(1),
  plan: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  dependencies: z.array(z.string().min(1)).optional(),
});

const taskDecomposedPayloadSchema = z.object({
  parent_task_id: z.string().min(1),
  child_task_ids: z.array(z.string().min(1)),
  summary: z.string().optional(),
  reason: z.string().optional(),
});

const assignedAgentSchema = z.object({
  agent_name: z.string().min(1),
  agent_role: z.string().min(1),
  attempt_id: z.string().min(1),
});

const taskAssignedPayloadSchema = z.object({
  task_id: z.string().min(1),
  assignment_id: z.string().min(1),
  assigned_agents: z.array(assignedAgentSchema),
});

const spawnRequestedPayloadSchema = z.object({
  task_id: z.string().min(1),
  needed_role: z.string().min(1),
  reason_code: z.string().min(1),
  instructions: z.string().min(1),
  content: z.string().min(1),
});

const spawnApprovedPayloadSchema = z.object({
  task_id: z.string().min(1),
  approved_agents: z.array(assignedAgentSchema),
  summary: z.string().optional(),
});

const spawnDeniedPayloadSchema = z.object({
  task_id: z.string().min(1),
  reason_code: z.string().min(1),
  details: z.string().optional(),
});

const verificationRequestedPayloadSchema = z.object({
  task_id: z.string().min(1),
  verification_type: z.string().min(1),
  requested_by: z.string().min(1),
  detail: z.string().optional(),
});

const verificationCompletedPayloadSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(['passed', 'failed', 'blocked']),
  reviewer: z.string().min(1),
  details: z.string().optional(),
});

const checkpointCreatedPayloadSchema = z.object({
  checkpoint_id: z.string().min(1),
  task_id: z.string().min(1),
  summary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const handoffEventPayloadSchema = z.object({
  handoff_id: z.string().min(1).optional(),
  to_actor_type: z.string().min(1).optional(),
  to_actor_id: z.string().min(1).optional(),
  reason_code: z.string().min(1).optional(),
  context_ref: z.string().min(1).optional(),
  expected_outcome: z.string().min(1).optional(),
}).passthrough();

const guardrailEventPayloadSchema = z.object({
  guardrail_name: z.string().min(1).optional(),
  phase: z.string().min(1).optional(),
  result: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
}).passthrough();

const traceEventPayloadSchema = z.object({
  trace_id: z.string().min(1).optional(),
  event_name: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const limitEventPayloadSchema = z.object({
  limit_event_id: z.string().min(1).optional(),
  limit_type: z.string().min(1).optional(),
  scope_type: z.string().min(1).optional(),
  scope_id: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  threshold_name: z.string().min(1).optional(),
  current_value: z.number().optional(),
  threshold_value: z.number().optional(),
  retry_after_ms: z.number().optional(),
  degraded_mode: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const checkpointEventPayloadSchema = z.object({
  checkpoint_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  checkpoint_type: z.string().min(1).optional(),
  content: z.string().optional(),
  summary_ref: z.string().optional(),
}).passthrough();

const toolNameEnum = z.enum(['file_read', 'file_write', 'nx_run', 'web_search', 'checkpoint_search'] as const);
const toolRequestPayloadSchema = z.object({
  request_id: z.string().min(1),
  tool_name: toolNameEnum,
  parameters: z.record(z.string(), z.unknown()).optional(),
});

const toolResponsePayloadSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum(['success', 'error']),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().min(1).optional(),
});

const runCompletedPayloadSchema = z.object({
  run_id: z.string().min(1),
  status: z.enum(['completed', 'failed', 'cancelled']),
  summary: z.string().optional(),
});

const payloadSchemas: { [K in MessageType]: z.ZodType<MessagePayloadMap[K]> } = {
  status_update: statusUpdatePayloadSchema,
  task_created: taskCreatedPayloadSchema,
  task_intake_accepted: taskIntakeAcceptedPayloadSchema,
  chat: chatPayloadSchema,
  heartbeat: heartbeatPayloadSchema,
  request_help: requestHelpPayloadSchema,
  artifact: artifactPayloadSchema,
  artifact_created: artifactCreatedPayloadSchema,
  clarification_request: clarificationRequestPayloadSchema,
  plan_proposed: planProposedPayloadSchema,
  task_decomposed: taskDecomposedPayloadSchema,
  task_assigned: taskAssignedPayloadSchema,
  spawn_requested: spawnRequestedPayloadSchema,
  spawn_approved: spawnApprovedPayloadSchema,
  spawn_denied: spawnDeniedPayloadSchema,
  verification_requested: verificationRequestedPayloadSchema,
  verification_completed: verificationCompletedPayloadSchema,
  checkpoint_created: checkpointCreatedPayloadSchema,
  run_completed: runCompletedPayloadSchema,
  handoff_event: handoffEventPayloadSchema,
  guardrail_event: guardrailEventPayloadSchema,
  trace_event: traceEventPayloadSchema,
  limit_event: limitEventPayloadSchema,
  checkpoint_event: checkpointEventPayloadSchema,
  tool_request: toolRequestPayloadSchema,
  tool_response: toolResponsePayloadSchema,
};

const envelopeSchemas = (Object.keys(payloadSchemas) as MessageType[]).map((type) =>
  baseEnvelopeSchema.extend({
    type: z.literal(type),
    payload: payloadSchemas[type],
  }),
);

const messageEnvelopeSchema = z.union(envelopeSchemas) as z.ZodType<MessageEnvelope>;
const clientTypeEnum = z.enum(['agent', 'orchestrator', 'human', 'dashboard', 'system'] as const);
const authPayloadSchema: z.ZodType<AuthPayload> = z.object({
  room_id: z.string().min(1),
  agent_name: z.string().min(1),
  agent_role: z.string().min(1),
  client_type: clientTypeEnum.optional(),
  token: z.string().min(1).optional(),
});

const authMessageSchema: z.ZodType<AuthMessage> = z.object({
  type: z.literal('auth'),
  project_id: z.string().min(1),
  timestamp: isoTimestampSchema,
  payload: authPayloadSchema,
});

export { messageEnvelopeSchema, authMessageSchema };
