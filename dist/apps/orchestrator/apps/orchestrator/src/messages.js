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
  buildAgentArtifactMessage: () => buildAgentArtifactMessage,
  buildAgentRequestHelp: () => buildAgentRequestHelp,
  buildAgentStatusUpdate: () => buildAgentStatusUpdate,
  buildClarificationRequest: () => buildClarificationRequest,
  buildOperatorChatResponse: () => buildOperatorChatResponse,
  buildOrchestratorStatusUpdate: () => buildOrchestratorStatusUpdate
});
module.exports = __toCommonJS(messages_exports);
var import_node_crypto = require("node:crypto");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const buildActor = (name, actorType) => ({
  actor_type: actorType,
  actor_id: name,
  actor_name: name
});
const buildAgentStatusUpdate = (config, taskId, roomId, agentName, phase, statusCode, content, compression) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "status_update",
  from: buildActor(agentName, "agent"),
  timestamp: nowIso(),
  payload: {
    phase,
    status_code: statusCode,
    content
  },
  compression
});
const buildOrchestratorStatusUpdate = (config, roomId, phase, statusCode, content, taskId) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "status_update",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    phase,
    status_code: statusCode,
    content
  }
});
const buildAgentArtifactMessage = (config, taskId, roomId, agentName, artifact) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "artifact",
  from: buildActor(agentName, "agent"),
  timestamp: nowIso(),
  payload: {
    artifact_kind: artifact.kind,
    title: artifact.title,
    content: artifact.content
  }
});
const buildAgentRequestHelp = (config, taskId, roomId, agentName, request) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "request_help",
  from: buildActor(agentName, "agent"),
  timestamp: nowIso(),
  payload: {
    needed_role: request.role,
    reason_code: request.reason,
    instructions: request.instructions,
    content: `Need ${request.role}: ${request.reason}`
  }
});
const buildClarificationRequest = (config, taskId, roomId, targetUserId, question) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "clarification_request",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    target_user_id: targetUserId,
    question,
    content: targetUserId ? `@${targetUserId} ${question}` : question
  }
});
const buildOperatorChatResponse = (config, content) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: "operator",
  type: "chat",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    content
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAgentArtifactMessage,
  buildAgentRequestHelp,
  buildAgentStatusUpdate,
  buildClarificationRequest,
  buildOperatorChatResponse,
  buildOrchestratorStatusUpdate
});
