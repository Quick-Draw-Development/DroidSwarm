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
  buildAgentToolResponseMessage: () => buildAgentToolResponseMessage,
  buildArtifactCreatedMessage: () => buildArtifactCreatedMessage,
  buildCheckpointCreatedMessage: () => buildCheckpointCreatedMessage,
  buildClarificationRequest: () => buildClarificationRequest,
  buildOperatorChatResponse: () => buildOperatorChatResponse,
  buildOrchestratorStatusUpdate: () => buildOrchestratorStatusUpdate,
  buildPlanProposedMessage: () => buildPlanProposedMessage,
  buildSpawnRequestedMessage: () => buildSpawnRequestedMessage,
  buildTaskAssignedMessage: () => buildTaskAssignedMessage,
  buildToolRequestMessage: () => buildToolRequestMessage,
  buildToolResponseMessage: () => buildToolResponseMessage,
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
const buildEnvelope = (input) => {
  const id = (0, import_node_crypto.randomUUID)();
  const ts = nowIso();
  return {
    id,
    message_id: id,
    ts,
    project_id: input.config.projectId,
    room_id: input.roomId,
    task_id: input.taskId,
    agent_id: input.from.actor_id,
    role: input.from.actor_name,
    verb: input.verb,
    depends_on: input.dependsOn,
    artifact_refs: input.artifactRefs,
    memory_refs: input.memoryRefs,
    body: input.body ?? input.payload,
    type: input.type,
    from: input.from,
    timestamp: ts,
    payload: input.payload,
    compression: input.compression,
    usage: input.usage
  };
};
const buildAgentStatusUpdate = (config, taskId, roomId, agentName, phase, statusCode, content, compression, payloadExtras) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "status_update",
  from: buildActor(agentName, "agent"),
  verb: "status.updated",
  payload: {
    phase,
    status_code: statusCode,
    content,
    ...payloadExtras
  },
  compression
});
const buildOrchestratorStatusUpdate = (config, roomId, phase, statusCode, content, taskId, extraPayload) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "status_update",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "status.updated",
  payload: {
    phase,
    status_code: statusCode,
    content,
    ...extraPayload
  }
});
const buildArtifactCreatedMessage = (config, taskId, roomId, agentName, artifact) => {
  const artifactId = (0, import_node_crypto.randomUUID)();
  return buildEnvelope({
    config,
    roomId,
    taskId,
    type: "artifact_created",
    from: buildActor(agentName, "agent"),
    verb: "artifact.created",
    artifactRefs: [artifactId],
    payload: {
      artifact_id: artifactId,
      task_id: taskId,
      kind: artifact.kind,
      summary: artifact.summary,
      content: artifact.content ?? artifact.path ?? artifact.uri ?? artifact.summary
    }
  });
};
const buildSpawnRequestedMessage = (config, taskId, roomId, agentName, request) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "spawn_requested",
  from: buildActor(agentName, "agent"),
  verb: "spawn.requested",
  payload: {
    task_id: taskId,
    needed_role: request.role,
    reason_code: request.reason,
    instructions: request.instructions,
    content: `Need ${request.role}: ${request.reason}`
  }
});
const buildTaskAssignedMessage = (config, taskId, roomId, assignmentId, agents) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "task_assigned",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "task.ready",
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
const buildClarificationRequest = (config, taskId, roomId, targetUserId, question) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "clarification_request",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "task.blocked",
  payload: {
    target_user_id: targetUserId,
    question,
    content: targetUserId ? `@${targetUserId} ${question}` : question
  }
});
const buildAgentToolResponseMessage = (config, taskId, roomId, agentName, payload, usage) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "tool_response",
  from: buildActor(agentName, "agent"),
  verb: "tool.response",
  payload,
  usage
});
const buildOperatorChatResponse = (config, content) => buildEnvelope({
  config,
  roomId: "operator",
  type: "chat",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "chat.message",
  payload: { content }
});
const buildPlanProposedMessage = (config, taskId, planId, summary, plan, dependencies) => buildEnvelope({
  config,
  roomId: "operator",
  taskId,
  type: "plan_proposed",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "plan.proposed",
  dependsOn: dependencies,
  payload: {
    task_id: taskId,
    plan_id: planId,
    summary,
    plan,
    dependencies
  }
});
const buildToolRequestMessage = (config, taskId, agentName, payload) => buildEnvelope({
  config,
  roomId: taskId,
  taskId,
  type: "tool_request",
  from: buildActor(agentName, "agent"),
  verb: "tool.request",
  payload,
  body: payload
});
const buildToolResponseMessage = (config, taskId, requestId, status, result, error) => buildEnvelope({
  config,
  roomId: taskId,
  taskId,
  type: "tool_response",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "tool.response",
  payload: {
    request_id: requestId,
    status,
    result,
    error
  }
});
const buildVerificationRequestedMessage = (config, taskId, verificationType, requestedBy, detail) => buildEnvelope({
  config,
  roomId: "operator",
  taskId,
  type: "verification_requested",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "verification.requested",
  payload: {
    task_id: taskId,
    verification_type: verificationType,
    requested_by: requestedBy,
    detail
  }
});
const buildVerificationCompletedMessage = (config, taskId, stage, status, reviewer, details) => buildEnvelope({
  config,
  roomId: "operator",
  taskId,
  type: "verification_completed",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "verification.completed",
  payload: {
    task_id: taskId,
    status,
    reviewer,
    details: [`stage=${stage}`, details].filter(Boolean).join(" | ")
  }
});
const buildCheckpointCreatedMessage = (config, taskId, roomId, checkpointId, summary, metadata) => buildEnvelope({
  config,
  roomId,
  taskId,
  type: "checkpoint_created",
  from: buildActor(config.agentName, "orchestrator"),
  verb: "checkpoint.created",
  memoryRefs: [checkpointId],
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
  buildAgentToolResponseMessage,
  buildArtifactCreatedMessage,
  buildCheckpointCreatedMessage,
  buildClarificationRequest,
  buildOperatorChatResponse,
  buildOrchestratorStatusUpdate,
  buildPlanProposedMessage,
  buildSpawnRequestedMessage,
  buildTaskAssignedMessage,
  buildToolRequestMessage,
  buildToolResponseMessage,
  buildVerificationCompletedMessage,
  buildVerificationRequestedMessage
});
