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
  buildTaskIntakeAccepted: () => buildTaskIntakeAccepted,
  messageEnvelopeSchema: () => messageEnvelopeSchema,
  parseEnvelope: () => parseEnvelope
});
module.exports = __toCommonJS(protocol_exports);
var import_node_crypto = require("node:crypto");
var import_zod = require("zod");
const isoTimestampSchema = import_zod.z.string().datetime({ offset: true });
const actorRefSchema = import_zod.z.object({
  actor_type: import_zod.z.enum(["agent", "orchestrator", "human", "system", "tool"]),
  actor_id: import_zod.z.string().min(1),
  actor_name: import_zod.z.string().min(1)
});
const messageEnvelopeSchema = import_zod.z.object({
  message_id: import_zod.z.string().min(1),
  project_id: import_zod.z.string().min(1),
  room_id: import_zod.z.string().min(1),
  task_id: import_zod.z.string().min(1).optional(),
  type: import_zod.z.enum(["status_update", "task_created", "task_intake_accepted", "chat", "heartbeat"]),
  from: actorRefSchema,
  timestamp: isoTimestampSchema,
  payload: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown())
});
const parseEnvelope = (raw) => messageEnvelopeSchema.parse(JSON.parse(raw));
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const buildAuthMessage = (config) => ({
  type: "auth",
  project_id: config.projectId,
  timestamp: nowIso(),
  payload: {
    room_id: "operator",
    agent_name: config.agentName,
    agent_role: config.agentRole,
    client_type: "orchestrator",
    token: config.operatorToken
  }
});
const buildHeartbeatMessage = (config) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: "operator",
  type: "heartbeat",
  from: {
    actor_type: "orchestrator",
    actor_id: config.agentName,
    actor_name: config.agentName
  },
  timestamp: nowIso(),
  payload: {}
});
const buildTaskIntakeAccepted = (config, taskId) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: "operator",
  task_id: taskId,
  type: "task_intake_accepted",
  from: {
    actor_type: "orchestrator",
    actor_id: config.agentName,
    actor_name: config.agentName
  },
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    accepted: true,
    next_status: "planning",
    content: "Task intake accepted by orchestrator."
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAuthMessage,
  buildHeartbeatMessage,
  buildTaskIntakeAccepted,
  messageEnvelopeSchema,
  parseEnvelope
});
