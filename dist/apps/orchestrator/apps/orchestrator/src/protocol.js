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
var protocol_exports = {};
__export(protocol_exports, {
  buildAuthMessage: () => buildAuthMessage,
  buildHeartbeatMessage: () => buildHeartbeatMessage,
  buildRoomAuthMessage: () => buildRoomAuthMessage,
  buildRoomHeartbeatMessage: () => buildRoomHeartbeatMessage,
  buildTaskIntakeAccepted: () => buildTaskIntakeAccepted,
  parseCanonicalEnvelope: () => parseCanonicalEnvelope,
  parseEnvelope: () => parseEnvelope
});
module.exports = __toCommonJS(protocol_exports);
var import_src = require("../../../packages/protocol-alias/src/index");
var import_node_crypto = require("node:crypto");
var import_protocol = require("@protocol");
var import_shared_types = require("@shared-types");
const parseCanonicalEnvelope = (raw) => (0, import_shared_types.normalizeToEnvelopeV2)(JSON.parse(raw));
const parseEnvelope = (raw) => {
  const parsed = JSON.parse(raw);
  const canonical = (0, import_shared_types.normalizeToEnvelopeV2)(parsed);
  return (0, import_shared_types.isEnvelopeV2)(parsed) ? canonicalEnvelopeToMessage(canonical) : (0, import_protocol.normalizeEnvelopeV2)(parsed);
};
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
  "consensus.round": "trace_event",
  "summary.emitted": "guardrail_event",
  "memory.pinned": "checkpoint_event",
  "drift.detected": "trace_event",
  "status.updated": "status_update",
  "tool.request": "tool_request",
  "tool.response": "tool_response",
  "chat.message": "chat",
  heartbeat: "heartbeat"
};
const canonicalEnvelopeToMessage = (canonical) => ({
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
  payload: canonical.body
});
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const buildAuthMessage = (config) => buildRoomAuthMessage(config, "operator", config.agentName, "orchestrator", config.agentRole);
const buildRoomAuthMessage = (config, roomId, agentName, clientType, agentRole = config.agentRole) => ({
  type: "auth",
  project_id: config.projectId,
  timestamp: nowIso(),
  payload: {
    room_id: roomId,
    agent_name: agentName,
    agent_role: agentRole,
    client_type: clientType,
    token: roomId === "operator" ? config.operatorToken : void 0
  }
});
const buildHeartbeatMessage = (config) => buildRoomHeartbeatMessage(config, "operator", config.agentName);
const buildRoomHeartbeatMessage = (config, roomId, agentName) => {
  const id = (0, import_node_crypto.randomUUID)();
  const ts = nowIso();
  return {
    id,
    message_id: id,
    project_id: config.projectId,
    room_id: roomId,
    type: "heartbeat",
    from: {
      actor_type: "orchestrator",
      actor_id: agentName,
      actor_name: agentName
    },
    ts,
    timestamp: ts,
    agent_id: agentName,
    role: config.agentRole,
    verb: "heartbeat",
    body: {},
    payload: {}
  };
};
const buildTaskIntakeAccepted = (config, taskId) => {
  const id = (0, import_node_crypto.randomUUID)();
  const ts = nowIso();
  return {
    id,
    message_id: id,
    project_id: config.projectId,
    room_id: "operator",
    task_id: taskId,
    type: "task_intake_accepted",
    from: {
      actor_type: "orchestrator",
      actor_id: config.agentName,
      actor_name: config.agentName
    },
    ts,
    timestamp: ts,
    agent_id: config.agentName,
    role: config.agentRole,
    verb: "task.accept",
    body: {
      task_id: taskId,
      accepted: true,
      next_status: "planning",
      content: "Task intake accepted by orchestrator."
    },
    payload: {
      task_id: taskId,
      accepted: true,
      next_status: "planning",
      content: "Task intake accepted by orchestrator."
    }
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAuthMessage,
  buildHeartbeatMessage,
  buildRoomAuthMessage,
  buildRoomHeartbeatMessage,
  buildTaskIntakeAccepted,
  parseCanonicalEnvelope,
  parseEnvelope
});
