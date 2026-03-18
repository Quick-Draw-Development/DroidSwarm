var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_node_test = require("node:test");
var import_strict = __toESM(require("node:assert/strict"));
var import_worker_registry = require("./worker-registry");
(0, import_node_test.describe)("WorkerRegistry", () => {
  (0, import_node_test.it)("tracks active agents per task", () => {
    const registry = new import_worker_registry.WorkerRegistry();
    registry.register({
      taskId: "task-1",
      title: "Add login",
      description: "Implement login flow",
      taskType: "feature",
      priority: "high",
      createdAt: "2026-03-12T12:00:00.000Z"
    });
    registry.assignAgents("task-1", ["Planner-01", "Coder-01"]);
    import_strict.default.deepEqual(registry.getState("task-1").activeAgents, ["Planner-01", "Coder-01"]);
  });
  (0, import_node_test.it)("clears agents when task is cancelled", () => {
    const registry = new import_worker_registry.WorkerRegistry();
    registry.register({
      taskId: "task-1",
      title: "Add login",
      description: "Implement login flow",
      taskType: "feature",
      priority: "high",
      createdAt: "2026-03-12T12:00:00.000Z"
    });
    registry.assignAgents("task-1", ["Planner-01", "Coder-01"]);
    const removed = registry.clearAgents("task-1");
    import_strict.default.deepEqual(removed, ["Planner-01", "Coder-01"]);
    import_strict.default.deepEqual(registry.getActiveAgents("task-1"), []);
  });
  (0, import_node_test.it)("removes a single agent when they exit", () => {
    const registry = new import_worker_registry.WorkerRegistry();
    registry.register({
      taskId: "task-2",
      title: "Investigate bug",
      description: "Bug triage",
      taskType: "bug",
      priority: "medium",
      createdAt: "2026-03-12T12:05:00.000Z"
    });
    registry.assignAgents("task-2", ["Planner-01", "Coder-02"]);
    registry.removeAgent("task-2", "Planner-01");
    import_strict.default.deepEqual(registry.getActiveAgents("task-2"), ["Coder-02"]);
  });
});
