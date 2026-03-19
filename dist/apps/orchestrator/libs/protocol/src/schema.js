var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schema_exports = {};
__export(schema_exports, {
  authMessageSchema: () => authMessageSchema,
  messageEnvelopeSchema: () => messageEnvelopeSchema
});
module.exports = __toCommonJS(schema_exports);
var import_zod = require("zod");
const isoTimestampSchema = import_zod.z.string().datetime({ offset: true });
const actorTypeEnum = import_zod.z.enum(["agent", "orchestrator", "human", "system", "tool"]);
const actorRefSchema = import_zod.z.object({
  actor_type: actorTypeEnum,
  actor_id: import_zod.z.string().min(1),
  actor_name: import_zod.z.string().min(1)
});
const compressionSchema = import_zod.z.object({
  scheme: import_zod.z.string().min(1),
  compressed_content: import_zod.z.string().min(1)
});
const usageSchema = import_zod.z.object({
  total_tokens: import_zod.z.number().int().nonnegative().optional(),
  input_tokens: import_zod.z.number().int().nonnegative().optional(),
  cached_input_tokens: import_zod.z.number().int().nonnegative().optional(),
  output_tokens: import_zod.z.number().int().nonnegative().optional(),
  reasoning_output_tokens: import_zod.z.number().int().nonnegative().optional()
});
const baseEnvelopeSchema = import_zod.z.object({
  message_id: import_zod.z.string().min(1),
  project_id: import_zod.z.string().min(1),
  room_id: import_zod.z.string().min(1),
  task_id: import_zod.z.string().min(1).optional(),
  from: actorRefSchema,
  timestamp: isoTimestampSchema,
  reply_to: import_zod.z.string().min(1).optional(),
  trace_id: import_zod.z.string().min(1).optional(),
  span_id: import_zod.z.string().min(1).optional(),
  session_id: import_zod.z.string().min(1).optional(),
  usage: usageSchema.optional(),
  compression: compressionSchema.optional()
});
const statusUpdatePayloadSchema = import_zod.z.object({
  phase: import_zod.z.string().min(1),
  status_code: import_zod.z.string().min(1),
  content: import_zod.z.string().min(1),
  metadata: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional()
}).passthrough();
const taskCreatedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  title: import_zod.z.string().optional(),
  description: import_zod.z.string().optional(),
  task_type: import_zod.z.string().optional(),
  priority: import_zod.z.string().optional(),
  created_by: import_zod.z.string().optional(),
  created_by_user_id: import_zod.z.string().optional(),
  branch_name: import_zod.z.string().optional()
});
const taskIntakeAcceptedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  accepted: import_zod.z.boolean(),
  next_status: import_zod.z.string().optional(),
  content: import_zod.z.string().optional()
});
const chatPayloadSchema = import_zod.z.object({
  content: import_zod.z.string().min(1)
});
const heartbeatPayloadSchema = import_zod.z.object({});
const requestHelpPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1).optional(),
  needed_role: import_zod.z.string().min(1),
  reason_code: import_zod.z.string().min(1),
  instructions: import_zod.z.string().min(1),
  content: import_zod.z.string().min(1)
});
const artifactPayloadSchema = import_zod.z.object({
  artifact_kind: import_zod.z.string().min(1),
  title: import_zod.z.string().min(1),
  content: import_zod.z.string().min(1)
});
const artifactCreatedPayloadSchema = import_zod.z.object({
  artifact_id: import_zod.z.string().min(1),
  task_id: import_zod.z.string().min(1),
  kind: import_zod.z.string().min(1),
  summary: import_zod.z.string().min(1),
  content: import_zod.z.string().min(1),
  metadata: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional()
});
const clarificationRequestPayloadSchema = import_zod.z.object({
  target_user_id: import_zod.z.string().min(1).optional(),
  question: import_zod.z.string().min(1),
  content: import_zod.z.string().min(1),
  question_id: import_zod.z.string().min(1).optional(),
  reason_code: import_zod.z.string().min(1).optional()
});
const planProposedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  plan_id: import_zod.z.string().min(1),
  summary: import_zod.z.string().min(1),
  plan: import_zod.z.string().optional(),
  confidence: import_zod.z.number().min(0).max(1).optional(),
  dependencies: import_zod.z.array(import_zod.z.string().min(1)).optional()
});
const taskDecomposedPayloadSchema = import_zod.z.object({
  parent_task_id: import_zod.z.string().min(1),
  child_task_ids: import_zod.z.array(import_zod.z.string().min(1)),
  summary: import_zod.z.string().optional(),
  reason: import_zod.z.string().optional()
});
const assignedAgentSchema = import_zod.z.object({
  agent_name: import_zod.z.string().min(1),
  agent_role: import_zod.z.string().min(1),
  attempt_id: import_zod.z.string().min(1)
});
const taskAssignedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  assignment_id: import_zod.z.string().min(1),
  assigned_agents: import_zod.z.array(assignedAgentSchema)
});
const spawnRequestedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  needed_role: import_zod.z.string().min(1),
  reason_code: import_zod.z.string().min(1),
  instructions: import_zod.z.string().min(1),
  content: import_zod.z.string().min(1)
});
const spawnApprovedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  approved_agents: import_zod.z.array(assignedAgentSchema),
  summary: import_zod.z.string().optional()
});
const spawnDeniedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  reason_code: import_zod.z.string().min(1),
  details: import_zod.z.string().optional()
});
const verificationRequestedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  verification_type: import_zod.z.string().min(1),
  requested_by: import_zod.z.string().min(1),
  detail: import_zod.z.string().optional()
});
const verificationCompletedPayloadSchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  status: import_zod.z.enum(["passed", "failed", "blocked"]),
  reviewer: import_zod.z.string().min(1),
  details: import_zod.z.string().optional()
});
const checkpointCreatedPayloadSchema = import_zod.z.object({
  checkpoint_id: import_zod.z.string().min(1),
  task_id: import_zod.z.string().min(1),
  summary: import_zod.z.string().optional(),
  metadata: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional()
});
const handoffEventPayloadSchema = import_zod.z.object({
  handoff_id: import_zod.z.string().min(1).optional(),
  to_actor_type: import_zod.z.string().min(1).optional(),
  to_actor_id: import_zod.z.string().min(1).optional(),
  reason_code: import_zod.z.string().min(1).optional(),
  context_ref: import_zod.z.string().min(1).optional(),
  expected_outcome: import_zod.z.string().min(1).optional()
}).passthrough();
const guardrailEventPayloadSchema = import_zod.z.object({
  guardrail_name: import_zod.z.string().min(1).optional(),
  phase: import_zod.z.string().min(1).optional(),
  result: import_zod.z.string().min(1).optional(),
  details: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional(),
  content: import_zod.z.string().optional()
}).passthrough();
const traceEventPayloadSchema = import_zod.z.object({
  trace_id: import_zod.z.string().min(1).optional(),
  event_name: import_zod.z.string().min(1).optional(),
  status: import_zod.z.string().min(1).optional(),
  metadata: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional()
}).passthrough();
const limitEventPayloadSchema = import_zod.z.object({
  limit_event_id: import_zod.z.string().min(1).optional(),
  limit_type: import_zod.z.string().min(1).optional(),
  scope_type: import_zod.z.string().min(1).optional(),
  scope_id: import_zod.z.string().min(1).optional(),
  status: import_zod.z.string().min(1).optional(),
  threshold_name: import_zod.z.string().min(1).optional(),
  current_value: import_zod.z.number().optional(),
  threshold_value: import_zod.z.number().optional(),
  retry_after_ms: import_zod.z.number().optional(),
  degraded_mode: import_zod.z.string().min(1).optional(),
  details: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional()
}).passthrough();
const checkpointEventPayloadSchema = import_zod.z.object({
  checkpoint_id: import_zod.z.string().min(1).optional(),
  session_id: import_zod.z.string().min(1).optional(),
  checkpoint_type: import_zod.z.string().min(1).optional(),
  content: import_zod.z.string().optional(),
  summary_ref: import_zod.z.string().optional()
}).passthrough();
const runCompletedPayloadSchema = import_zod.z.object({
  run_id: import_zod.z.string().min(1),
  status: import_zod.z.enum(["completed", "failed", "cancelled"]),
  summary: import_zod.z.string().optional()
});
const payloadSchemas = {
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
  checkpoint_event: checkpointEventPayloadSchema
};
const envelopeSchemas = Object.keys(payloadSchemas).map(
  (type) => baseEnvelopeSchema.extend({
    type: import_zod.z.literal(type),
    payload: payloadSchemas[type]
  })
);
const messageEnvelopeSchema = import_zod.z.union(envelopeSchemas);
const clientTypeEnum = import_zod.z.enum(["agent", "orchestrator", "human", "dashboard", "system"]);
const authPayloadSchema = import_zod.z.object({
  room_id: import_zod.z.string().min(1),
  agent_name: import_zod.z.string().min(1),
  agent_role: import_zod.z.string().min(1),
  client_type: clientTypeEnum.optional(),
  token: import_zod.z.string().min(1).optional()
});
const authMessageSchema = import_zod.z.object({
  type: import_zod.z.literal("auth"),
  project_id: import_zod.z.string().min(1),
  timestamp: isoTimestampSchema,
  payload: authPayloadSchema
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  authMessageSchema,
  messageEnvelopeSchema
});
