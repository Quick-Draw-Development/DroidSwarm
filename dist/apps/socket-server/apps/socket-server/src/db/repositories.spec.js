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
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_schema = require("./schema");
var import_repositories = require("./repositories");
(0, import_node_test.default)("sqlite persistence stores messages and extracted mentions", () => {
  const database = new import_better_sqlite3.default(":memory:");
  (0, import_schema.applySchema)(database);
  const repository = new import_repositories.SqlitePersistence(database);
  repository.ensureChannel({
    channelId: "task-1",
    projectId: "droidswarm",
    channelType: "task",
    name: "task-1",
    status: "active",
    createdAt: "2026-03-12T12:00:00.000Z",
    updatedAt: "2026-03-12T12:00:00.000Z"
  });
  const message = {
    message_id: "msg-1",
    project_id: "droidswarm",
    room_id: "task-1",
    task_id: "task-1",
    type: "clarification_request",
    from: {
      actor_type: "orchestrator",
      actor_id: "orch-1",
      actor_name: "Orchestrator"
    },
    timestamp: "2026-03-12T12:00:00.000Z",
    payload: {
      question_id: "q-1",
      target_user_id: "alice_dev",
      reason_code: "needs_human_clarification",
      question: "Which API should be used?",
      content: "Please clarify which API is required."
    }
  };
  repository.recordMessage(message);
  const storedMessage = database.prepare("SELECT message_type FROM messages WHERE message_id = ?").get("msg-1");
  const storedMention = database.prepare("SELECT mentioned_id FROM message_mentions WHERE message_id = ?").get("msg-1");
  import_strict.default.equal(storedMessage?.message_type, "clarification_request");
  import_strict.default.equal(storedMention?.mentioned_id, "alice_dev");
  repository.close();
});
(0, import_node_test.default)("sqlite persistence stores task events", () => {
  const database = new import_better_sqlite3.default(":memory:");
  (0, import_schema.applySchema)(database);
  const repository = new import_repositories.SqlitePersistence(database);
  repository.recordTaskEvent({
    eventId: "event-1",
    projectId: "droidswarm",
    taskId: "task-1",
    eventType: "task_created",
    actorType: "human",
    actorId: "alice_dev",
    payload: { title: "Create task" },
    createdAt: "2026-03-12T12:00:00.000Z"
  });
  const storedEvent = database.prepare("SELECT event_type, actor_id FROM task_events WHERE event_id = ?").get("event-1");
  import_strict.default.equal(storedEvent?.event_type, "task_created");
  import_strict.default.equal(storedEvent?.actor_id, "alice_dev");
  repository.close();
});
