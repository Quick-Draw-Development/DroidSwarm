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
const resolveTaskFromMessage = (message) => {
  const taskId = message.task_id ?? (typeof message.payload.task_id === "string" ? message.payload.task_id : void 0);
  if (!taskId) {
    return void 0;
  }
  return {
    taskId,
    title: typeof message.payload.title === "string" ? message.payload.title : taskId,
    description: typeof message.payload.description === "string" ? message.payload.description : "",
    taskType: typeof message.payload.task_type === "string" ? message.payload.task_type : "task",
    priority: typeof message.payload.priority === "string" ? message.payload.priority : "medium",
    createdByUserId: typeof message.payload.created_by === "string" ? message.payload.created_by : typeof message.payload.created_by_user_id === "string" ? message.payload.created_by_user_id : void 0,
    createdAt: message.timestamp,
    branchName: typeof message.payload.branch_name === "string" ? message.payload.branch_name : void 0
  };
};
const isCancellationMessage = (message) => {
  if (message.type !== "status_update" || message.room_id !== "operator") {
    return false;
  }
  const statusCode = typeof message.payload.status_code === "string" ? message.payload.status_code : "";
  const metadata = typeof message.payload.metadata === "object" && message.payload.metadata !== null ? message.payload.metadata : void 0;
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
