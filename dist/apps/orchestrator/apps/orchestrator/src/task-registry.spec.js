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
var import_task_registry = require("./task-registry");
(0, import_node_test.describe)("TaskRegistry", () => {
  (0, import_node_test.it)("registers a task and tracks assigned agents", () => {
    const registry = new import_task_registry.TaskRegistry();
    registry.register({
      taskId: "task-1",
      title: "Add login",
      description: "Implement login flow",
      taskType: "feature",
      priority: "high",
      createdAt: "2026-03-12T12:00:00.000Z"
    });
    registry.assignAgents("task-1", ["Planner-01", "Coder-01"]);
    import_strict.default.deepEqual(registry.get("task-1")?.activeAgents, ["Planner-01", "Coder-01"]);
    import_strict.default.equal(registry.get("task-1")?.task.title, "Add login");
  });
  (0, import_node_test.it)("cancels a task and removes active agents", () => {
    const registry = new import_task_registry.TaskRegistry();
    registry.register({
      taskId: "task-1",
      title: "Add login",
      description: "Implement login flow",
      taskType: "feature",
      priority: "high",
      createdAt: "2026-03-12T12:00:00.000Z"
    });
    registry.assignAgents("task-1", ["Planner-01", "Coder-01"]);
    const removed = registry.cancel("task-1", "2026-03-12T12:05:00.000Z");
    import_strict.default.deepEqual(removed, ["Planner-01", "Coder-01"]);
    import_strict.default.deepEqual(registry.get("task-1")?.activeAgents, []);
    import_strict.default.equal(registry.get("task-1")?.status, "cancelled");
  });
});
