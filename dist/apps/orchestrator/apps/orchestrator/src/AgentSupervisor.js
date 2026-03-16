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
var AgentSupervisor_exports = {};
__export(AgentSupervisor_exports, {
  AgentSupervisor: () => AgentSupervisor
});
module.exports = __toCommonJS(AgentSupervisor_exports);
var import_node_crypto = require("node:crypto");
var import_node_child_process = require("node:child_process");
var import_operator_notifications = require("./operator-notifications");
const defaultRoleInstructions = (task) => {
  const normalizedType = task.taskType.toLowerCase();
  if (normalizedType === "bug") {
    return [{
      role: "coder-backend",
      reason: "bug-triage",
      instructions: `Investigate and fix the reported bug in task ${task.taskId}.`
    }];
  }
  return [{
    role: "planner",
    reason: "initial-planning",
    instructions: `Plan the work for task ${task.taskId}, propose next roles, and identify blockers.`
  }];
};
class AgentSupervisor {
  constructor(config, registry, entryScript, callbacks = {}) {
    this.config = config;
    this.registry = registry;
    this.entryScript = entryScript;
    this.callbacks = callbacks;
    this.agents = /* @__PURE__ */ new Map();
    this.roleCounters = /* @__PURE__ */ new Map();
  }
  startInitialAgents(task) {
    const existing = this.registry.get(task.taskId);
    if (existing?.activeAgents.length) {
      return [];
    }
    return this.spawnRequests(task, defaultRoleInstructions(task));
  }
  spawnRequests(task, requests, parentSummary, parentDroidspeak) {
    const spawned = [];
    const taskState = this.registry.get(task.taskId);
    const activeCount = taskState?.activeAgents.length ?? 0;
    const availableTaskSlots = Math.max(0, this.config.maxAgentsPerTask - activeCount);
    const availableGlobalSlots = Math.max(0, this.config.maxConcurrentAgents - this.agents.size);
    const maxSpawn = Math.min(availableTaskSlots, availableGlobalSlots);
    for (const request of requests.slice(0, maxSpawn)) {
      const agentName = this.nextAgentName(request.role);
      const child = (0, import_node_child_process.fork)(this.entryScript, ["worker", JSON.stringify({
        task,
        role: request.role,
        agentName,
        parentSummary: parentSummary ?? request.instructions,
        parentDroidspeak
      })], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe", "ipc"]
      });
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        text.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
          console.log("[AgentSupervisor]", agentName, "stdout:", line);
        });
      });
      const agent = {
        child,
        taskId: task.taskId,
        agentName,
        role: request.role
      };
      this.agents.set(agentName, agent);
      const currentNames = this.registry.get(task.taskId)?.activeAgents ?? [];
      this.registry.assignAgents(task.taskId, [...currentNames, agentName]);
      spawned.push({ agentName, taskId: task.taskId, role: request.role });
      child.on("message", (message) => {
        this.handleAgentMessage(task, message);
      });
      child.on("exit", () => {
        this.registry.removeAgent(task.taskId, agentName);
        this.agents.delete(agentName);
      });
    }
    if (spawned.length > 0) {
      this.callbacks.onAgentsAssigned?.(task.taskId, spawned);
    }
    return spawned;
  }
  cancelTask(taskId) {
    const removedAgents = [...this.registry.get(taskId)?.activeAgents ?? []];
    for (const agentName of removedAgents) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        continue;
      }
      agent.child.kill("SIGTERM");
      this.agents.delete(agentName);
    }
    this.registry.cancel(taskId, (/* @__PURE__ */ new Date()).toISOString());
    return removedAgents;
  }
  handleAgentMessage(task, message) {
    if (message.type !== "agent_result" || message.taskId !== task.taskId) {
      return;
    }
    const taskState = this.registry.get(task.taskId);
    if (!taskState || taskState.status === "cancelled") {
      return;
    }
    if (message.result.requested_agents.length > 0) {
      this.spawnRequests(
        task,
        message.result.requested_agents,
        message.result.summary,
        message.result.compression?.compressed_content
      );
      this.callbacks.onAgentCommunication?.(
        task.taskId,
        (0, import_operator_notifications.formatAgentRequestContent)(message.agentName, message.result.requested_agents)
      );
    }
  }
  nextAgentName(role) {
    const prefix = role.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("-") || "Agent";
    const nextValue = (this.roleCounters.get(prefix) ?? 0) + 1;
    this.roleCounters.set(prefix, nextValue);
    return `${prefix}-${String(nextValue).padStart(2, "0")}-${(0, import_node_crypto.randomUUID)().slice(0, 4)}`;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentSupervisor
});
