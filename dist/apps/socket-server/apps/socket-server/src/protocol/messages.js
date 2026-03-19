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
var messages_exports = {};
__export(messages_exports, {
  buildAuthSuccessMessage: () => buildAuthSuccessMessage,
  buildErrorMessage: () => buildErrorMessage,
  buildSystemMessage: () => buildSystemMessage
});
module.exports = __toCommonJS(messages_exports);
var import_node_crypto = require("node:crypto");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const buildSystemMessage = (projectId, roomId, type, payload) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: projectId,
  room_id: roomId,
  type,
  from: {
    actor_type: "system",
    actor_id: "system",
    actor_name: "System"
  },
  timestamp: nowIso(),
  payload
});
const buildAuthSuccessMessage = (projectId, client) => buildSystemMessage(projectId, client.roomId, "status_update", {
  status_code: "ready",
  phase: "auth",
  content: `Authenticated ${client.agentName}`
});
const buildErrorMessage = (projectId, roomId, content, reasonCode) => buildSystemMessage(projectId, roomId, "guardrail_event", {
  guardrail_name: "socket_protocol",
  phase: "input",
  result: "fail",
  details: {
    reason_code: reasonCode
  },
  content
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAuthSuccessMessage,
  buildErrorMessage,
  buildSystemMessage
});
//# sourceMappingURL=messages.js.map
