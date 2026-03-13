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
var task_registry_exports = {};
__export(task_registry_exports, {
  TaskRegistry: () => TaskRegistry
});
module.exports = __toCommonJS(task_registry_exports);
class TaskRegistry {
  constructor() {
    this.tasks = /* @__PURE__ */ new Map();
  }
  register(task) {
    const existing = this.tasks.get(task.taskId);
    if (existing) {
      existing.task = task;
      existing.updatedAt = task.createdAt;
      return existing;
    }
    const state = {
      task,
      status: "pending",
      activeAgents: [],
      updatedAt: task.createdAt
    };
    this.tasks.set(task.taskId, state);
    return state;
  }
  assignAgents(taskId, agentNames) {
    const state = this.get(taskId);
    if (!state) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    state.activeAgents = [...new Set(agentNames)];
    state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return state;
  }
  cancel(taskId, updatedAt) {
    const task = this.get(taskId);
    if (!task) {
      return [];
    }
    const removedAgents = [...task.activeAgents];
    task.status = "cancelled";
    task.activeAgents = [];
    task.updatedAt = updatedAt;
    return removedAgents;
  }
  get(taskId) {
    return this.tasks.get(taskId);
  }
  removeAgent(taskId, agentName) {
    const task = this.get(taskId);
    if (!task) {
      return;
    }
    task.activeAgents = task.activeAgents.filter((candidate) => candidate !== agentName);
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TaskRegistry
});
