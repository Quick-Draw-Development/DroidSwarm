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
var import_node_test = require("node:test");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = __toESM(require("node:path"));
var import_database = require("./persistence/database");
var import_repositories = require("./persistence/repositories");
var import_service = require("./persistence/service");
var import_run_lifecycle = require("./run-lifecycle");
var import_run_shutdown = require("./run-shutdown");
(0, import_node_test.describe)("run shutdown helper", () => {
  const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-shutdown-"));
  const dbPath = import_node_path.default.join(workspace, "state.db");
  const database = (0, import_database.openPersistenceDatabase)(dbPath);
  const persistence = import_repositories.PersistenceClient.fromDatabase(database);
  const runLifecycle = new import_run_lifecycle.RunLifecycleService(persistence);
  (0, import_node_test.it)("skips terminal runs", () => {
    const run = persistence.createRun("droidswarm");
    runLifecycle.completeRun(run, "already done");
    const result = (0, import_run_shutdown.finalizeRunOnShutdown)(persistence, runLifecycle, run.runId);
    import_strict.default.equal(result, "noop");
    const events = database.prepare("SELECT event_type FROM execution_events WHERE run_id = ?").all(run.runId);
    import_strict.default.ok(events.some((row) => row.event_type === "run_completed"));
  });
  (0, import_node_test.it)("completes run when tasks are terminal", () => {
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: "terminal-task",
      name: "done",
      priority: "medium",
      status: "completed"
    });
    const result = (0, import_run_shutdown.finalizeRunOnShutdown)(persistence, runLifecycle, run.runId);
    import_strict.default.equal(result, "completed");
    import_strict.default.equal(persistence.runs.get(run.runId)?.status, "completed");
    const events = database.prepare("SELECT event_type FROM execution_events WHERE run_id = ? ORDER BY created_at ASC").all(run.runId);
    import_strict.default.ok(events.some((row) => row.event_type === "run_completed"));
  });
  (0, import_node_test.it)("records interruption when active tasks remain", () => {
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: "running-task",
      name: "in-flight",
      priority: "medium",
      status: "running"
    });
    const result = (0, import_run_shutdown.finalizeRunOnShutdown)(persistence, runLifecycle, run.runId);
    import_strict.default.equal(result, "interrupted");
    import_strict.default.equal(persistence.runs.get(run.runId)?.status, "running");
    const eventRow = database.prepare("SELECT event_type FROM execution_events WHERE run_id = ? ORDER BY created_at DESC LIMIT 1").get(run.runId);
    import_strict.default.equal(eventRow?.event_type, "run_interrupted");
  });
  (0, import_node_test.it)("does not duplicate interruption events for repeated calls", () => {
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: "running-task-2",
      name: "still running",
      priority: "medium",
      status: "running"
    });
    const first = (0, import_run_shutdown.finalizeRunOnShutdown)(persistence, runLifecycle, run.runId);
    const second = (0, import_run_shutdown.finalizeRunOnShutdown)(persistence, runLifecycle, run.runId);
    import_strict.default.equal(first, "interrupted");
    import_strict.default.equal(second, "interrupted");
    const rows = database.prepare("SELECT COUNT(*) as count FROM execution_events WHERE run_id = ? AND event_type = ?").get(run.runId, "run_interrupted");
    import_strict.default.equal(rows.count, 1);
  });
  (0, import_node_test.after)(() => {
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
});
