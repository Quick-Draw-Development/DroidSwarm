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
var import_task_events = require("./task-events");
const baseMessage = {
  message_id: "msg-1",
  project_id: "proj-1",
  room_id: "operator",
  task_id: "task-1",
  type: "task_created",
  from: {
    actor_type: "human",
    actor_id: "user-1",
    actor_name: "alice"
  },
  timestamp: "2026-03-12T12:00:00.000Z",
  payload: {
    task_id: "task-1",
    title: "Implement login",
    description: "Build the login flow",
    task_type: "feature",
    priority: "high",
    created_by: "alice"
  }
};
(0, import_node_test.describe)("task-events", () => {
  (0, import_node_test.it)("resolves task metadata from a task_created message", () => {
    const task = (0, import_task_events.resolveTaskFromMessage)(baseMessage);
    import_strict.default.equal(task?.taskId, "task-1");
    import_strict.default.equal(task?.title, "Implement login");
    import_strict.default.equal(task?.createdByUserId, "alice");
  });
  (0, import_node_test.it)("detects cancellation messages", () => {
    import_strict.default.equal((0, import_task_events.isCancellationMessage)({
      ...baseMessage,
      type: "status_update",
      payload: {
        status_code: "task_cancelled"
      }
    }), true);
  });
});
