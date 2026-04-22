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
var import_run_lifecycle = require("./run-lifecycle");
var import_service = require("./persistence/service");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
(0, import_node_test.describe)("RunLifecycleService", () => {
  (0, import_node_test.it)("starts and completes a run while recording events", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-runlifecycles-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const lifecycle = new import_run_lifecycle.RunLifecycleService(persistence);
    const run = persistence.createRun("droidswarm");
    lifecycle.startRun(run);
    const started = persistence.runs.get(run.runId);
    import_strict.default.equal(started?.status, "running");
    lifecycle.completeRun(run, "all good");
    const completed = persistence.runs.get(run.runId);
    import_strict.default.equal(completed?.status, "completed");
    const eventRow = database.prepare("SELECT event_type, detail FROM execution_events WHERE run_id = ? ORDER BY created_at ASC").all(run.runId);
    import_strict.default.equal(eventRow.length, 2);
    import_strict.default.equal(eventRow[0]?.event_type, "run_started");
    import_strict.default.equal(eventRow[1]?.event_type, "run_completed");
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("requeues interrupted running tasks even without checkpoints", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-runlifecycles-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const lifecycle = new import_run_lifecycle.RunLifecycleService(persistence);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    const task = service.createTask({
      taskId: "task-recovery",
      name: "task",
      priority: "medium",
      status: "running"
    });
    const attempt = service.createAttempt("attempt-1", task, "Agent", "worker");
    const summaries = lifecycle.recoverInterruptedRuns();
    const runRow = persistence.runs.get(run.runId);
    import_strict.default.equal(runRow?.status, "running");
    const updatedTask = persistence.tasks.get(task.taskId);
    import_strict.default.equal(updatedTask?.status, "queued");
    import_strict.default.equal(updatedTask?.metadata?.recovery_reason, "requeued_after_restart");
    import_strict.default.equal(updatedTask?.metadata?.recovery_previous_status, "running");
    const attemptRow = service.getAttempt(attempt.attemptId);
    import_strict.default.equal(attemptRow?.status, "failed");
    import_strict.default.equal(attemptRow?.metadata?.recovery_interrupted_status, "running");
    import_strict.default.equal(summaries.length, 1);
    import_strict.default.deepEqual(summaries[0].resumedTasks, [task.taskId]);
    import_strict.default.equal(summaries[0].failedTasks.length, 0);
    const events = database.prepare("SELECT event_type FROM execution_events WHERE run_id = ?").all(run.runId);
    import_strict.default.ok(events.some((row) => row.event_type === "run_recovered"));
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("requeues interrupted tasks with checkpoints", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-runlifecycles-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const lifecycle = new import_run_lifecycle.RunLifecycleService(persistence);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    const task = service.createTask({
      taskId: "task-resume",
      name: "task",
      priority: "medium",
      status: "running"
    });
    const attempt = service.createAttempt("attempt-2", task, "Agent", "worker");
    service.recordCheckpoint(task.taskId, attempt.attemptId, {
      summary: "checkpoint"
    });
    const summaries = lifecycle.recoverInterruptedRuns();
    const updatedTask = persistence.tasks.get(task.taskId);
    import_strict.default.equal(updatedTask?.status, "queued");
    import_strict.default.equal(updatedTask?.metadata?.recovery_reason, "requeued_after_restart");
    import_strict.default.equal(updatedTask?.metadata?.recovery_previous_status, "running");
    const runRow = persistence.runs.get(run.runId);
    import_strict.default.equal(runRow?.status, "running");
    import_strict.default.equal(summaries.length, 1);
    import_strict.default.deepEqual(summaries[0].resumedTasks, [task.taskId]);
    import_strict.default.equal(summaries[0].failedTasks.length, 0);
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("requeues blocked attempts after restart", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-runlifecycles-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const lifecycle = new import_run_lifecycle.RunLifecycleService(persistence);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    const task = service.createTask({
      taskId: "task-blocked",
      name: "blocked task",
      priority: "medium",
      status: "waiting_on_human"
    });
    const attempt = service.createAttempt("attempt-blocked", task, "Agent", "worker");
    service.updateAttemptStatus(attempt.attemptId, "blocked", { reason: "waiting for review" });
    const summaries = lifecycle.recoverInterruptedRuns();
    const updatedTask = persistence.tasks.get(task.taskId);
    import_strict.default.equal(updatedTask?.status, "queued");
    import_strict.default.equal(updatedTask?.metadata?.recovery_previous_status, "waiting_on_human");
    const attemptRow = service.getAttempt(attempt.attemptId);
    import_strict.default.equal(attemptRow?.status, "failed");
    import_strict.default.equal(attemptRow?.metadata?.recovery_interrupted_status, "blocked");
    import_strict.default.deepEqual(summaries[0].resumedTasks, [task.taskId]);
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
});
