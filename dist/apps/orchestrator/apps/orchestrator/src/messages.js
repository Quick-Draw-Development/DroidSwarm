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
  buildAgentStatusUpdate: () => buildAgentStatusUpdate,
  buildArtifactCreatedMessage: () => buildArtifactCreatedMessage,
  buildCheckpointCreatedMessage: () => buildCheckpointCreatedMessage,
  buildClarificationRequest: () => buildClarificationRequest,
  buildOperatorChatResponse: () => buildOperatorChatResponse,
  buildOrchestratorStatusUpdate: () => buildOrchestratorStatusUpdate,
  buildPlanProposedMessage: () => buildPlanProposedMessage,
  buildSpawnRequestedMessage: () => buildSpawnRequestedMessage,
  buildTaskAssignedMessage: () => buildTaskAssignedMessage,
  buildVerificationCompletedMessage: () => buildVerificationCompletedMessage,
  buildVerificationRequestedMessage: () => buildVerificationRequestedMessage
});
module.exports = __toCommonJS(messages_exports);
var import_node_crypto = require("node:crypto");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const buildActor = (name, actorType) => ({
  actor_type: actorType,
  actor_id: name,
  actor_name: name
});
const buildAgentStatusUpdate = (config, taskId, roomId, agentName, phase, statusCode, content, compression, payloadExtras) => ({
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
    content,
    ...payloadExtras
  },
  compression
});
const buildOrchestratorStatusUpdate = (config, roomId, phase, statusCode, content, taskId, extraPayload) => ({
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
    content,
    ...extraPayload
  }
});
const buildArtifactCreatedMessage = (config, taskId, roomId, agentName, artifact) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "artifact_created",
  from: buildActor(agentName, "agent"),
  timestamp: nowIso(),
  payload: {
    artifact_id: (0, import_node_crypto.randomUUID)(),
    task_id: taskId,
    kind: artifact.kind,
    summary: artifact.title,
    content: artifact.content
  }
});
const buildSpawnRequestedMessage = (config, taskId, roomId, agentName, request) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "spawn_requested",
  from: buildActor(agentName, "agent"),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    needed_role: request.role,
    reason_code: request.reason,
    instructions: request.instructions,
    content: `Need ${request.role}: ${request.reason}`
  }
});
const buildTaskAssignedMessage = (config, taskId, roomId, assignmentId, agents) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "task_assigned",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    assignment_id: assignmentId,
    assigned_agents: agents.map((agent) => ({
      agent_name: agent.agentName,
      agent_role: agent.role,
      attempt_id: agent.attemptId
    }))
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
const buildPlanProposedMessage = (config, taskId, planId, summary, plan, dependencies) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: "operator",
  task_id: taskId,
  type: "plan_proposed",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    plan_id: planId,
    summary,
    plan,
    dependencies
  }
});
const buildVerificationRequestedMessage = (config, taskId, verificationType, requestedBy, detail) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: "operator",
  task_id: taskId,
  type: "verification_requested",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    verification_type: verificationType,
    requested_by: requestedBy,
    detail
  }
});
const buildVerificationCompletedMessage = (config, taskId, stage, status, reviewer, details) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: "operator",
  task_id: taskId,
  type: "verification_completed",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    task_id: taskId,
    status,
    reviewer,
    details: [`stage=${stage}`, details].filter(Boolean).join(" | ")
  }
});
const buildCheckpointCreatedMessage = (config, taskId, roomId, checkpointId, summary, metadata) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: config.projectId,
  room_id: roomId,
  task_id: taskId,
  type: "checkpoint_created",
  from: buildActor(config.agentName, "orchestrator"),
  timestamp: nowIso(),
  payload: {
    checkpoint_id: checkpointId,
    task_id: taskId,
    summary,
    metadata
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAgentStatusUpdate,
  buildArtifactCreatedMessage,
  buildCheckpointCreatedMessage,
  buildClarificationRequest,
  buildOperatorChatResponse,
  buildOrchestratorStatusUpdate,
  buildPlanProposedMessage,
  buildSpawnRequestedMessage,
  buildTaskAssignedMessage,
  buildVerificationCompletedMessage,
  buildVerificationRequestedMessage
});
