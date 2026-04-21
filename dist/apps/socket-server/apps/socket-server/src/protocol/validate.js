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
var validate_exports = {};
__export(validate_exports, {
  isOperatorOnlyMessage: () => isOperatorOnlyMessage,
  parseAuthMessage: () => parseAuthMessage,
  parseCanonicalEnvelope: () => parseCanonicalEnvelope,
  parseIncomingEnvelope: () => parseIncomingEnvelope,
  parseMessageEnvelope: () => parseMessageEnvelope
});
module.exports = __toCommonJS(validate_exports);
var import_protocol = require("@protocol");
var import_shared_types = require("@shared-types");
const parseAuthMessage = (input) => import_protocol.authMessageSchema.parse(JSON.parse(input));
const parseCanonicalEnvelope = (input) => (0, import_shared_types.normalizeToEnvelopeV2)(JSON.parse(input));
const parseMessageEnvelope = (input) => (0, import_protocol.normalizeEnvelopeV2)(JSON.parse(input));
const parseIncomingEnvelope = (input) => {
  const parsed = JSON.parse(input);
  const canonical = (0, import_shared_types.normalizeToEnvelopeV2)(parsed);
  return {
    canonical,
    message: (0, import_shared_types.isEnvelopeV2)(parsed) ? canonicalEnvelopeToMessage(parsed, canonical) : (0, import_protocol.normalizeEnvelopeV2)(parsed)
  };
};
const isOperatorOnlyMessage = (type) => type === "task_created" || type === "task_intake_accepted";
const typeByVerb = {
  "task.create": "task_created",
  "task.accept": "task_intake_accepted",
  "task.ready": "task_assigned",
  "task.blocked": "clarification_request",
  "plan.proposed": "plan_proposed",
  "spawn.requested": "spawn_requested",
  "spawn.approved": "spawn_approved",
  "spawn.denied": "spawn_denied",
  "artifact.created": "artifact_created",
  "checkpoint.created": "checkpoint_created",
  "verification.requested": "verification_requested",
  "verification.completed": "verification_completed",
  "run.completed": "run_completed",
  "handoff.ready": "handoff_event",
  "summary.emitted": "guardrail_event",
  "memory.pinned": "checkpoint_event",
  "status.updated": "status_update",
  "tool.request": "tool_request",
  "tool.response": "tool_response",
  "chat.message": "chat",
  heartbeat: "heartbeat"
};
const canonicalEnvelopeToMessage = (raw, canonical) => {
  const record = typeof raw === "object" && raw !== null ? raw : {};
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
      actor_type: "agent",
      actor_id: canonical.agent_id ?? canonical.role ?? "unknown-agent",
      actor_name: canonical.role ?? canonical.agent_id ?? "unknown-agent"
    },
    timestamp: canonical.ts,
    payload: canonical.body,
    reply_to: typeof record.reply_to === "string" ? record.reply_to : void 0,
    trace_id: typeof record.trace_id === "string" ? record.trace_id : void 0,
    span_id: typeof record.span_id === "string" ? record.span_id : void 0,
    session_id: typeof record.session_id === "string" ? record.session_id : void 0
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isOperatorOnlyMessage,
  parseAuthMessage,
  parseCanonicalEnvelope,
  parseIncomingEnvelope,
  parseMessageEnvelope
});
