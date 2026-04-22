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
  AgentSupervisor: () => AgentSupervisor,
  defaultRoleInstructions: () => defaultRoleInstructions
});
module.exports = __toCommonJS(AgentSupervisor_exports);
var import_node_crypto = require("node:crypto");
var import_node_child_process = require("node:child_process");
var import_shared_routing = require("@shared-routing");
const defaultRoleInstructions = (task) => {
  const normalizedType = task.taskType.toLowerCase();
  if (normalizedType === "bug") {
    const role2 = (0, import_shared_routing.getSwarmRoleDefinition)("bugfix-helper").id;
    return [{
      role: role2,
      reason: "bug-triage",
      instructions: `Investigate and fix the reported bug in task ${task.taskId}.`
    }];
  }
  const role = (0, import_shared_routing.getSwarmRoleDefinition)("planner").id;
  return [{
    role,
    reason: "initial-planning",
    instructions: `Plan the work for task ${task.taskId}, propose next roles, and identify blockers.`
  }];
};
class AgentSupervisor {
  constructor(config, registry, entryScript, callbacks = {}) {
    this.config = config;
    this.registry = registry;
    this.entryScript = entryScript;
    this.agents = /* @__PURE__ */ new Map();
    this.roleCounters = /* @__PURE__ */ new Map();
    this.callbacks = callbacks;
  }
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  startAgentForTask(task, role, attemptId, parentSummary, parentDroidspeak, model, options) {
    if (!this.canSpawn(task)) {
      return null;
    }
    this.registry.register(task);
    const agentName = this.nextAgentName(role);
    const mode = role === "tester" ? "verifier" : "worker";
    const child = (0, import_node_child_process.fork)(this.entryScript, [mode, JSON.stringify({
      task,
      role,
      agentName,
      attemptId,
      parentSummary,
      parentDroidspeak,
      model,
      engine: options?.engine,
      scope: options?.scope,
      skillPacks: options?.skillPacks,
      skillTexts: options?.skillTexts,
      readOnly: options?.readOnly,
      instructions: options?.instructions,
      workspacePath: options?.workspacePath,
      taskDigest: options?.taskDigest,
      handoffPacket: options?.handoffPacket,
      modelTier: options?.modelTier,
      routingTelemetry: options?.routingTelemetry,
      requiredReads: options?.requiredReads,
      compactVerbDictionary: options?.compactVerbDictionary
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
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      text.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
        console.error("[AgentSupervisor]", agentName, "stderr:", line);
      });
    });
    const agent = {
      child,
      taskId: task.taskId,
      agentName,
      role,
      attemptId
    };
    this.agents.set(agentName, agent);
    const currentNames = this.registry.get(task.taskId)?.activeAgents ?? [];
    this.registry.assignAgents(task.taskId, [...currentNames, agentName]);
    child.on("exit", () => {
      this.registry.removeAgent(task.taskId, agentName);
      this.agents.delete(agentName);
    });
    const spawned = {
      agentName,
      taskId: task.taskId,
      role,
      attemptId
    };
    this.callbacks.onAgentsAssigned?.(task.taskId, [spawned]);
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
    this.registry.clearAgents(taskId);
    return removedAgents;
  }
  getActiveAgentCount() {
    return this.agents.size;
  }
  countActiveAgents(predicate) {
    if (!predicate) {
      return this.agents.size;
    }
    let count = 0;
    for (const agent of this.agents.values()) {
      if (predicate(agent)) {
        count += 1;
      }
    }
    return count;
  }
  canSpawn(task) {
    const taskState = this.registry.get(task.taskId);
    const activeCount = taskState?.activeAgents.length ?? 0;
    const availableTaskSlots = Math.max(0, this.config.maxAgentsPerTask - activeCount);
    const availableGlobalSlots = Math.max(0, this.config.maxConcurrentAgents - this.agents.size);
    return availableTaskSlots > 0 && availableGlobalSlots > 0;
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
  AgentSupervisor,
  defaultRoleInstructions
});
