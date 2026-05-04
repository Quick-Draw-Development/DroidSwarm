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
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_crypto = require("node:crypto");
var import_node_test = require("node:test");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = __toESM(require("node:path"), 1);
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
    const updated = persistence.attempts.getById(attempt.attemptId);
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
    const events = persistence.budgets.listByTask("task-limit");
    import_strict.default.equal(events.length, 1);
    import_strict.default.equal(events[0].detail, "test limit hit");
    import_strict.default.equal(events[0].consumed, 1);
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
    const stored = persistence.actions.listByTask("task-operator")[0];
    import_strict.default.equal(stored?.actionType, "cancel_task");
    import_strict.default.equal(stored?.detail, "operator requested cancel");
    import_strict.default.equal(JSON.parse(stored?.metadataJson ?? "{}").reason, "urgent");
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
    const stored = persistence.verifications.listByTask(task.taskId)[0];
    import_strict.default.equal(stored?.status, "passed");
    import_strict.default.equal(stored?.reviewer, "Tester");
    import_strict.default.equal(stored?.details, "all good");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
  (0, import_node_test.it)("stores task state digests and handoff packets", () => {
    const tempDir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-persistence-"));
    const dbPath = import_node_path.default.join(tempDir, "state.db");
    const db = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(db);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
    const task = service.createTask({
      taskId: "task-digest",
      name: "digest-task",
      priority: "medium",
      metadata: {
        description: "digest coverage"
      }
    });
    service.recordTaskStateDigest({
      id: "digest-1",
      taskId: task.taskId,
      runId: run.runId,
      projectId: "droidswarm",
      objective: "digest-task",
      currentPlan: ["plan"],
      decisions: ["decision"],
      openQuestions: [],
      activeRisks: [],
      artifactIndex: [],
      verificationState: "queued",
      lastUpdatedBy: "orch",
      ts: nowIso(),
      droidspeak: {
        kind: "summary_emitted",
        compact: "summary:emitted",
        expanded: "Summary emitted."
      }
    });
    const digest = service.getLatestTaskStateDigest(task.taskId);
    import_strict.default.equal(digest?.id, "digest-1");
    import_strict.default.equal(service.listTaskStateDigests(task.taskId).length, 1);
    service.recordArtifactMemory({
      id: "artifact-memory-1",
      taskId: task.taskId,
      runId: run.runId,
      projectId: "droidswarm",
      artifactId: "artifact-1",
      kind: "summary",
      shortSummary: "Artifact summary",
      reasonRelevant: "This artifact captures the latest implementation constraints.",
      trustConfidence: 0.88,
      sourceTaskId: task.taskId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    const artifactMemory = service.listArtifactMemory(task.taskId);
    import_strict.default.equal(artifactMemory.length, 1);
    import_strict.default.equal(artifactMemory[0]?.artifactId, "artifact-1");
    import_strict.default.equal(artifactMemory[0]?.reasonRelevant, "This artifact captures the latest implementation constraints.");
    service.recordHandoffPacket({
      id: "handoff-1",
      taskId: task.taskId,
      runId: run.runId,
      projectId: "droidswarm",
      fromTaskId: task.taskId,
      toRole: "coder",
      digestId: "digest-1",
      requiredReads: ["artifact-1"],
      summary: "handoff ready",
      ts: nowIso(),
      droidspeak: {
        kind: "handoff_ready",
        compact: "handoff:ready",
        expanded: "Handoff ready."
      }
    });
    const handoffs = service.listHandoffPackets(task.taskId);
    import_strict.default.equal(handoffs.length, 1);
    import_strict.default.equal(handoffs[0].digestId, "digest-1");
    import_strict.default.equal(service.getLatestHandoffPacket(task.taskId, run.runId)?.id, "handoff-1");
    db.close();
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  });
});
