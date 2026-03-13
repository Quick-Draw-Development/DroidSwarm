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
var import_agent_prompt = require("./agent-prompt");
(0, import_node_test.describe)("buildAgentPrompt", () => {
  (0, import_node_test.it)("includes task and role context for Codex workers", () => {
    const prompt = (0, import_agent_prompt.buildAgentPrompt)({
      agentName: "Planner-01",
      role: "planner",
      projectId: "proj-1",
      projectName: "Project 1",
      task: {
        taskId: "task-1",
        title: "Add login",
        description: "Implement login flow",
        taskType: "feature",
        priority: "high",
        createdAt: "2026-03-12T12:00:00.000Z",
        createdByUserId: "alice"
      }
    });
    import_strict.default.match(prompt, /Planner-01/);
    import_strict.default.match(prompt, /task_id: task-1/);
    import_strict.default.match(prompt, /Role: planner/);
  });
});
