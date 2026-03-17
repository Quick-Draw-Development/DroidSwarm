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
var import_database = require("../persistence/database");
var import_repositories = require("../persistence/repositories");
var import_service = require("../persistence/service");
var import_TaskScheduler = require("./TaskScheduler");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
(0, import_node_test.describe)("TaskScheduler", () => {
  (0, import_node_test.it)("schedules tasks, respects dependencies, and reopens parents when children finish", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId
        };
      },
      setCallbacks() {
      },
      getActiveAgentCount() {
        return 0;
      },
      countActiveAgents(_predicate) {
        return 0;
      }
    };
    const config = {
      environment: "test",
      projectId: "droidswarm",
      projectName: "DroidSwarm",
      projectRoot: "/",
      agentName: "Orchestrator",
      agentRole: "control-plane",
      socketUrl: "ws://localhost:8765",
      heartbeatMs: 1e3,
      reconnectMs: 1e3,
      codexBin: "codex",
      codexSandboxMode: "workspace-write",
      maxAgentsPerTask: 4,
      maxConcurrentAgents: 4,
      specDir: "",
      orchestratorRules: "",
      droidspeakRules: "",
      agentRules: "",
      dbPath: "",
      schedulerMaxTaskDepth: 4,
      schedulerMaxFanOut: 3,
      schedulerRetryIntervalMs: 1e3,
      maxConcurrentCodeAgents: 2,
      sideEffectActionsBeforeReview: 1,
      allowedTools: []
    };
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, config);
    const rootTask = service.createTask({
      taskId: "root",
      name: "Root Plan",
      priority: "medium",
      metadata: {
        description: "Top-level plan",
        task_type: "plan"
      }
    });
    scheduler.handleNewTask(rootTask.taskId);
    import_strict.default.equal(spawnLog.length, 1);
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "running");
    const planResult = {
      status: "completed",
      summary: "ready for work",
      requested_agents: [{
        role: "coder",
        reason: "implementation",
        instructions: "Implement the feature."
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);
    const tasksAfterPlan = service.getTasks();
    const childTask = tasksAfterPlan.find((task) => task.parentTaskId === rootTask.taskId);
    import_strict.default.ok(childTask);
    import_strict.default.equal(tasksAfterPlan.length, 2);
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "waiting_on_dependency");
    const dependencies = persistence.dependencies.listDependencies(rootTask.taskId);
    import_strict.default.equal(dependencies.length, 1);
    import_strict.default.equal(dependencies[0].dependsOnTaskId, childTask.taskId);
    import_strict.default.equal(spawnLog.length, 2, "child task should have been scheduled");
    const childAttempt = spawnLog[1];
    const childResult = {
      status: "completed",
      summary: "done",
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    scheduler.handleAgentResult(childTask.taskId, childAttempt.attemptId, childAttempt.agentName, childAttempt.role, childResult);
    import_strict.default.equal(service.getTask(childTask.taskId)?.status, "in_review");
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "waiting_on_dependency");
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("enforces token policies before letting work continue", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId
        };
      },
      setCallbacks() {
        return;
      },
      getActiveAgentCount() {
        return 0;
      },
      countActiveAgents(_predicate) {
        return 0;
      }
    };
    const config = {
      environment: "test",
      projectId: "droidswarm",
      projectName: "DroidSwarm",
      projectRoot: "/",
      agentName: "Orchestrator",
      agentRole: "control-plane",
      socketUrl: "ws://localhost:8765",
      heartbeatMs: 1e3,
      reconnectMs: 1e3,
      codexBin: "codex",
      codexSandboxMode: "workspace-write",
      maxAgentsPerTask: 4,
      maxConcurrentAgents: 4,
      specDir: "",
      orchestratorRules: "",
      droidspeakRules: "",
      agentRules: "",
      dbPath: "",
      schedulerMaxTaskDepth: 4,
      schedulerMaxFanOut: 3,
      schedulerRetryIntervalMs: 1e3,
      maxConcurrentCodeAgents: 2,
      sideEffectActionsBeforeReview: 1,
      allowedTools: []
    };
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, config);
    const policyTask = service.createTask({
      taskId: "policy-root",
      name: "Policy Task",
      priority: "medium",
      metadata: {
        description: "Respect token guards",
        task_type: "plan",
        policy: {
          max_tokens: 100
        }
      }
    });
    scheduler.handleNewTask(policyTask.taskId);
    import_strict.default.equal(spawnLog.length, 1);
    const result = {
      status: "completed",
      summary: "too many tokens",
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
      metrics: {
        tokens: 150
      }
    };
    scheduler.handleAgentResult(
      policyTask.taskId,
      spawnLog[0].attemptId,
      spawnLog[0].agentName,
      spawnLog[0].role,
      result
    );
    import_strict.default.equal(service.getTask(policyTask.taskId)?.status, "waiting_on_human");
    import_strict.default.equal(spawnLog.length, 1);
    const budgetEvent = database.prepare("SELECT detail FROM budget_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(policyTask.taskId);
    import_strict.default.ok(budgetEvent);
    import_strict.default.ok(typeof budgetEvent.detail === "string" && budgetEvent.detail.includes("max tokens"));
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
});
