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
var task_events_exports = {};
__export(task_events_exports, {
  buildTaskCancellationAcknowledged: () => buildTaskCancellationAcknowledged,
  isCancellationMessage: () => isCancellationMessage,
  resolveTaskFromMessage: () => resolveTaskFromMessage
});
module.exports = __toCommonJS(task_events_exports);
var import_node_crypto = require("node:crypto");
const asString = (value) => typeof value === "string" ? value : void 0;
const resolveTaskFromMessage = (message) => {
  const payload = message.payload;
  const metadata = typeof payload.metadata === "object" && payload.metadata !== null ? payload.metadata : void 0;
  const taskId = message.task_id ?? asString(payload.task_id) ?? asString(metadata?.task_id);
  if (!taskId) {
    return void 0;
  }
  return {
    taskId,
    title: asString(payload.title) ?? taskId,
    description: asString(payload.description) ?? "",
    taskType: asString(payload.task_type) ?? "task",
    priority: asString(payload.priority) ?? "medium",
    createdByUserId: asString(payload.created_by) ?? asString(payload.created_by_user_id),
    createdAt: message.timestamp,
    branchName: asString(payload.branch_name)
  };
};
const isCancellationMessage = (message) => {
  if (message.room_id !== "operator") {
    return false;
  }
  const payload = message.payload;
  const statusCode = asString(payload.status_code) ?? "";
  const metadata = typeof payload.metadata === "object" && payload.metadata !== null ? payload.metadata : void 0;
  return statusCode === "task_cancelled" || metadata?.status === "cancelled";
};
const buildTaskCancellationAcknowledged = (projectId, orchestratorName, taskId, removedAgents) => ({
  message_id: (0, import_node_crypto.randomUUID)(),
  project_id: projectId,
  room_id: "operator",
  task_id: taskId,
  type: "status_update",
  from: {
    actor_type: "orchestrator",
    actor_id: orchestratorName,
    actor_name: orchestratorName
  },
  timestamp: (/* @__PURE__ */ new Date()).toISOString(),
  payload: {
    status_code: "task_cancellation_acknowledged",
    phase: "cancelled",
    metadata: {
      status: "cancelled",
      removed_agents: removedAgents,
      removed_agent_count: removedAgents.length
    },
    content: removedAgents.length > 0 ? `Cancelled task and removed ${removedAgents.length} active agents.` : "Cancelled task and cleared agent assignments."
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildTaskCancellationAcknowledged,
  isCancellationMessage,
  resolveTaskFromMessage
});
