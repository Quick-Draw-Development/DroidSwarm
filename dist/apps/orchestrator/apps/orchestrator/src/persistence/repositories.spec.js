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
var import_node_crypto = require("node:crypto");
var import_node_test = require("node:test");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = __toESM(require("node:path"));
var import_database = require("./database");
var import_repositories = require("./repositories");
var import_service = require("./service");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
(0, import_node_test.describe)("Orchestrator persistence repositories", () => {
  (0, import_node_test.it)("creates and reads runs, tasks, and artifacts reliably", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    import_strict.default.equal(run.projectId, "droidswarm");
    const task = {
      taskId: "task-1",
      runId: run.runId,
      name: "phase-one",
      status: "queued",
      priority: "medium",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.tasks.create(task);
    const tasks = persistence.tasks.listByRun(run.runId);
    import_strict.default.equal(tasks.length, 1);
    import_strict.default.equal(tasks[0].name, "phase-one");
    const attempt = {
      attemptId: "attempt-1",
      taskId: task.taskId,
      runId: run.runId,
      agentName: "Planner-01",
      status: "running",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.attempts.create(attempt);
    const artifact = {
      artifactId: "artifact-1",
      attemptId: attempt.attemptId,
      taskId: task.taskId,
      runId: run.runId,
      kind: "summary",
      summary: "planned architecture",
      content: "Detailed plan",
      createdAt: nowIso()
    };
    persistence.artifacts.create(artifact);
    const artifacts = persistence.artifacts.listByTask(task.taskId);
    import_strict.default.equal(artifacts.length, 1);
    import_strict.default.equal(artifacts[0].summary, "planned architecture");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
  (0, import_node_test.it)("tracks dependencies and allows attempt status transitions", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    const parent = {
      taskId: "parent",
      runId: run.runId,
      name: "parent-task",
      status: "queued",
      priority: "high",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const child = {
      taskId: "child",
      runId: run.runId,
      parentTaskId: parent.taskId,
      name: "child-task",
      status: "queued",
      priority: "high",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.tasks.create(parent);
    persistence.tasks.create(child);
    persistence.dependencies.add({
      dependencyId: (0, import_node_crypto.randomUUID)(),
      taskId: child.taskId,
      dependsOnTaskId: parent.taskId,
      createdAt: nowIso()
    });
    const dependencies = persistence.dependencies.listDependencies(child.taskId);
    const dependents = persistence.dependencies.listDependents(parent.taskId);
    import_strict.default.equal(dependencies.length, 1);
    import_strict.default.equal(dependents.length, 1);
    import_strict.default.equal(dependencies[0].dependsOnTaskId, parent.taskId);
    const attempt = {
      attemptId: "attempt-2",
      taskId: parent.taskId,
      runId: run.runId,
      agentName: "Planner-01",
      status: "running",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.attempts.create(attempt);
    persistence.attempts.updateStatus(attempt.attemptId, "completed");
    const updated = db.prepare("SELECT status FROM task_attempts WHERE attempt_id = ?").get(attempt.attemptId);
    import_strict.default.equal(updated?.status, "completed");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
  (0, import_node_test.it)("stores artifacts and checkpoints via the persistence service", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    const task = {
      taskId: "task-checkpoint",
      runId: run.runId,
      name: "checkpoint-task",
      status: "queued",
      priority: "high",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.tasks.create(task);
    const attempt = {
      attemptId: "attempt-checkpoint",
      taskId: task.taskId,
      runId: task.runId,
      agentName: "Agent-01",
      status: "running",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.attempts.create(attempt);
    const checkpointPayload = { summary: "progress saved", compression: { compressed_content: "droidspeak-v1" } };
    const checkpointId = service.recordCheckpoint(task.taskId, attempt.attemptId, checkpointPayload);
    const latestCheckpoint = service.getLatestCheckpoint(task.taskId);
    import_strict.default.equal(typeof checkpointId, "string");
    import_strict.default.equal(latestCheckpoint?.attemptId, attempt.attemptId);
    import_strict.default.equal(JSON.parse(latestCheckpoint?.payloadJson ?? "{}").summary, "progress saved");
    service.recordArtifact({
      artifactId: "artifact-checkpoint",
      attemptId: attempt.attemptId,
      taskId: task.taskId,
      kind: "checkpoint",
      summary: "checkpoint artifact",
      content: "details",
      metadata: { source: "test" },
      createdAt: nowIso()
    });
    const artifacts = service.getArtifactsForTask(task.taskId);
    import_strict.default.equal(artifacts.length, 1);
    import_strict.default.equal(artifacts[0].metadata?.source, "test");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
  (0, import_node_test.it)("records budget events when thresholds fire", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: "task-limit",
      name: "budget-guard",
      priority: "low",
      metadata: {
        description: "placeholder for budget events"
      }
    });
    service.recordBudgetEvent("task-limit", "test limit hit", 1);
    const event = db.prepare("SELECT detail, consumed FROM budget_events WHERE task_id = ?").get("task-limit");
    import_strict.default.equal(event?.detail, "test limit hit");
    import_strict.default.equal(event?.consumed, 1);
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
  (0, import_node_test.it)("persists operator control actions", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: "task-operator",
      name: "operator-placeholder",
      priority: "medium",
      metadata: {
        description: "placeholder for operator actions"
      }
    });
    service.recordOperatorAction({
      taskId: "task-operator",
      actionType: "cancel_task",
      detail: "operator requested cancel",
      metadata: { reason: "urgent" }
    });
    const stored = db.prepare("SELECT action_type, detail, metadata_json FROM operator_actions WHERE task_id = ?").get("task-operator");
    import_strict.default.equal(stored?.action_type, "cancel_task");
    import_strict.default.equal(stored?.detail, "operator requested cancel");
    import_strict.default.equal(JSON.parse(stored?.metadata_json ?? "{}").reason, "urgent");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
  (0, import_node_test.it)("records verification outcomes for tasks", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    const task = {
      taskId: "task-verification",
      runId: run.runId,
      name: "verify-task",
      status: "queued",
      priority: "high",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    persistence.tasks.create(task);
    service.recordVerificationOutcome({
      taskId: task.taskId,
      stage: "verification",
      status: "passed",
      summary: "tests passed",
      reviewer: "Tester",
      details: "all good"
    });
    const stored = db.prepare("SELECT status, reviewer, details FROM verification_reviews WHERE task_id = ?").get(task.taskId);
    import_strict.default.equal(stored?.status, "passed");
    import_strict.default.equal(stored?.reviewer, "Tester");
    import_strict.default.equal(stored?.details, "all good");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
});
