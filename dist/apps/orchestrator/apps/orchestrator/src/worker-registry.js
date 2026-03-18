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
var worker_registry_exports = {};
__export(worker_registry_exports, {
  WorkerRegistry: () => WorkerRegistry
});
module.exports = __toCommonJS(worker_registry_exports);
class WorkerRegistry {
  constructor() {
    this.tasks = /* @__PURE__ */ new Map();
  }
  register(task) {
    const existing = this.tasks.get(task.taskId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existing) {
      existing.task = task;
      existing.lastUpdated = now;
      return existing;
    }
    const state = {
      task,
      activeAgents: [],
      lastUpdated: now
    };
    this.tasks.set(task.taskId, state);
    return state;
  }
  assignAgents(taskId, agentNames) {
    const state = this.ensureState(taskId);
    state.activeAgents = [...new Set(agentNames)];
    state.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    return state;
  }
  clearAgents(taskId) {
    const state = this.tasks.get(taskId);
    if (!state) {
      return [];
    }
    const removed = [...state.activeAgents];
    state.activeAgents = [];
    state.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    return removed;
  }
  get(taskId) {
    return this.tasks.get(taskId);
  }
  getState(taskId) {
    return this.ensureState(taskId);
  }
  getActiveAgents(taskId) {
    return [...this.tasks.get(taskId)?.activeAgents ?? []];
  }
  removeAgent(taskId, agentName) {
    const state = this.tasks.get(taskId);
    if (!state) {
      return;
    }
    state.activeAgents = state.activeAgents.filter((candidate) => candidate !== agentName);
    state.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  }
  hasTask(taskId) {
    return this.tasks.has(taskId);
  }
  ensureState(taskId) {
    const state = this.tasks.get(taskId);
    if (!state) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    return state;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WorkerRegistry
});
