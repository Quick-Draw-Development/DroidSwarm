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
var import_TaskScheduler = require("./scheduler/TaskScheduler");
var import_OrchestratorEngine = require("./engine/OrchestratorEngine");
var import_worker_registry = require("./worker-registry");
var import_OperatorActionService = require("./operator/OperatorActionService");
var import_OperatorChatResponder = require("./operator/OperatorChatResponder");
var import_run_lifecycle = require("./run-lifecycle");
var import_ToolService = require("./tools/ToolService");
const DEFAULT_CONFIG = {
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
  maxConcurrentCodeAgents: 2,
  specDir: "",
  orchestratorRules: "",
  droidspeakRules: "",
  agentRules: "",
  dbPath: "",
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 250,
  sideEffectActionsBeforeReview: 0,
  allowedTools: [],
  modelRouting: {
    planning: "o1-preview",
    verification: "gpt-4o-mini",
    code: "claude-3.5-sonnet",
    default: "o1-preview"
  },
  budgetMaxConsumed: void 0
};
class StubSupervisor {
  constructor() {
    this.assigned = [];
    this.attemptMap = /* @__PURE__ */ new Map();
    this.callbacks = {};
  }
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, model) {
    const agentName = `${task.taskId}-${role}-${attemptId.slice(0, 6)}`;
    const spawned = { agentName, taskId: task.taskId, role, attemptId };
    this.assigned.push(spawned);
    this.attemptMap.set(attemptId, spawned);
    this.callbacks.onAgentsAssigned?.(task.taskId, [spawned]);
    return spawned;
  }
  cancelTask(taskId) {
    const removed = this.assigned.filter((entry) => entry.taskId === taskId).map((entry) => entry.agentName);
    this.assigned.splice(0, this.assigned.length, ...this.assigned.filter((entry) => entry.taskId !== taskId));
    for (const [attemptId, entry] of this.attemptMap.entries()) {
      if (entry.taskId === taskId) {
        this.attemptMap.delete(attemptId);
      }
    }
    return removed;
  }
  getActiveAgentCount() {
    return this.assigned.length;
  }
  countActiveAgents(predicate) {
    if (!predicate) {
      return this.assigned.length;
    }
    return this.assigned.filter(predicate).length;
  }
  getLastSpawned() {
    return this.assigned[this.assigned.length - 1];
  }
}
class StubGateway {
  constructor() {
    this.sent = [];
    this.channels = /* @__PURE__ */ new Set();
  }
  send(message) {
    this.sent.push(message);
  }
  watchTaskChannel(taskId) {
    this.channels.add(taskId);
  }
}
class StubChatResponder extends import_OperatorChatResponder.OperatorChatResponder {
  constructor(config) {
    super(config);
  }
  async respond(content) {
    return `ack: ${content}`;
  }
}
const buildConfig = (dbPath) => ({
  ...DEFAULT_CONFIG,
  dbPath
});
const createEnvironment = (options) => {
  const workspace = options?.dbPath ? import_node_path.default.dirname(options.dbPath) : (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-phase10-"));
  const dbPath = options?.dbPath ?? import_node_path.default.join(workspace, "state.db");
  const database = (0, import_database.openPersistenceDatabase)(dbPath);
  const persistence = import_repositories.PersistenceClient.fromDatabase(database);
  const run = options?.run ?? persistence.createRun(DEFAULT_CONFIG.projectId);
  const runLifecycle = new import_run_lifecycle.RunLifecycleService(persistence);
  runLifecycle.startRun(run);
  const service = new import_service.OrchestratorPersistenceService(persistence, run);
  const supervisor = new StubSupervisor();
  const gateway = new StubGateway();
  const schedulerConfig = buildConfig(dbPath);
  const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisor, schedulerConfig);
  const chatResponder = new StubChatResponder(schedulerConfig);
  const controlService = new import_OperatorActionService.OperatorActionService(service, supervisor);
  const registry = new import_worker_registry.WorkerRegistry();
  const toolService = new import_ToolService.ToolService(schedulerConfig, service);
  const engine = new import_OrchestratorEngine.OrchestratorEngine({
    config: schedulerConfig,
    persistenceService: service,
    scheduler,
    supervisor,
    gateway,
    chatResponder,
    controlService,
    registry,
    runLifecycle: new import_run_lifecycle.RunLifecycleService(persistence),
    toolService
  });
  scheduler.setEvents({
    onPlanProposed: engine.onPlanProposed,
    onCheckpointCreated: engine.onCheckpointCreated,
    onVerificationRequested: engine.onVerificationRequested,
    onVerificationOutcome: engine.onVerificationOutcome
  });
  supervisor.setCallbacks({
    onAgentsAssigned: engine.handleAgentAssignment.bind(engine),
    onAgentCommunication: engine.handleAgentCommunication.bind(engine),
    onAgentResult: scheduler.handleAgentResult.bind(scheduler)
  });
  return {
    engine,
    scheduler,
    service,
    supervisor,
    gateway,
    database,
    persistence,
    runLifecycle,
    run,
    dbPath,
    workspace,
    close: () => database.close(),
    destroy: () => {
      database.close();
      (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
    }
  };
};
const buildTaskCreatedMessage = (taskId, timestamp) => ({
  message_id: `task-${taskId}`,
  project_id: DEFAULT_CONFIG.projectId,
  room_id: "operator",
  task_id: taskId,
  type: "task_created",
  from: {
    actor_type: "human",
    actor_id: "operator-1",
    actor_name: "operator"
  },
  timestamp: timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
  payload: {
    task_id: taskId,
    title: "Phase 10 epic",
    description: "Drive orchestration end-to-end",
    task_type: "feature",
    priority: "high",
    created_by: "operator"
  }
});
const planResult = {
  status: "completed",
  summary: "Plan ready",
  requested_agents: [{
    role: "coder",
    reason: "implementation",
    instructions: "Implement the feature."
  }],
  artifacts: [],
  doc_updates: [],
  branch_actions: []
};
const simpleResult = (status, summary) => ({
  status,
  summary,
  requested_agents: [],
  artifacts: [],
  doc_updates: [],
  branch_actions: []
});
(0, import_node_test.describe)("Phase 10 orchestrator flows", () => {
  (0, import_node_test.it)("runs a task from intake through verification and review", async () => {
    const env = createEnvironment();
    const message = buildTaskCreatedMessage("phase10-root");
    await env.engine.handleMessage(message, "operator");
    import_strict.default.equal(env.supervisor.assigned.length, 1);
    const rootSpawn = env.supervisor.assigned[0];
    env.scheduler.handleAgentResult(
      rootSpawn.taskId,
      rootSpawn.attemptId,
      rootSpawn.agentName,
      rootSpawn.role,
      planResult
    );
    const childSpawn = env.supervisor.assigned[1];
    import_strict.default.ok(childSpawn);
    const childTaskId = childSpawn.taskId;
    env.scheduler.handleAgentResult(
      childTaskId,
      childSpawn.attemptId,
      childSpawn.agentName,
      childSpawn.role,
      simpleResult("completed", "child done")
    );
    const rootTask = env.service.getTask(rootSpawn.taskId);
    import_strict.default.equal(rootTask?.status, "in_review");
    const verificationSpawn = env.supervisor.assigned[2];
    import_strict.default.ok(verificationSpawn);
    env.scheduler.handleAgentResult(
      verificationSpawn.taskId,
      verificationSpawn.attemptId,
      verificationSpawn.agentName,
      verificationSpawn.role,
      simpleResult("completed", "verification passed")
    );
    const reviewSpawn = env.supervisor.assigned[3];
    import_strict.default.ok(reviewSpawn);
    env.scheduler.handleAgentResult(
      reviewSpawn.taskId,
      reviewSpawn.attemptId,
      reviewSpawn.agentName,
      reviewSpawn.role,
      simpleResult("completed", "review passed")
    );
    const finalRoot = env.service.getTask(rootSpawn.taskId);
    import_strict.default.equal(finalRoot?.status, "verified");
    env.destroy();
  });
  (0, import_node_test.it)("cancels a task via operator status updates", async () => {
    const env = createEnvironment();
    const message = buildTaskCreatedMessage("phase10-cancel");
    await env.engine.handleMessage(message, "operator");
    import_strict.default.equal(env.supervisor.assigned.length, 1);
    const cancelMessage = {
      message_id: "cancel-1",
      project_id: DEFAULT_CONFIG.projectId,
      room_id: "operator",
      task_id: "phase10-cancel",
      type: "status_update",
      from: {
        actor_type: "human",
        actor_id: "operator-1",
        actor_name: "operator"
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        status_code: "task_cancelled",
        phase: "operator",
        content: "Operator cancelled the task.",
        metadata: {
          task_id: "phase10-cancel",
          status: "cancelled"
        }
      }
    };
    await env.engine.handleMessage(cancelMessage, "operator");
    const task = env.service.getTask("phase10-cancel");
    import_strict.default.equal(task?.status, "cancelled");
    import_strict.default.equal(env.supervisor.getActiveAgentCount(), 0);
    env.destroy();
  });
  (0, import_node_test.it)("resumes queued work after a restart", async () => {
    const env1 = createEnvironment();
    const message = buildTaskCreatedMessage("phase10-restart");
    await env1.engine.handleMessage(message, "operator");
    const rootSpawn = env1.supervisor.assigned[0];
    env1.scheduler.handleAgentResult(
      rootSpawn.taskId,
      rootSpawn.attemptId,
      rootSpawn.agentName,
      rootSpawn.role,
      planResult
    );
    const childSpawn = env1.supervisor.assigned[1];
    const childTaskId = childSpawn.taskId;
    import_strict.default.equal(env1.service.getTask(childTaskId)?.status, "running");
    env1.close();
    const env2 = createEnvironment({ dbPath: env1.dbPath, run: env1.run });
    env2.scheduler.handleNewTask(childTaskId);
    import_strict.default.equal(env2.supervisor.assigned.length, 1);
    import_strict.default.equal(env2.service.getTask(childTaskId)?.status, "running");
    env2.destroy();
  });
  (0, import_node_test.it)("recovers running work after restart and finalizes the run", async () => {
    const env1 = createEnvironment();
    const message = buildTaskCreatedMessage("phase10-finalize");
    await env1.engine.handleMessage(message, "operator");
    const rootSpawn = env1.supervisor.assigned[0];
    env1.scheduler.handleAgentResult(
      rootSpawn.taskId,
      rootSpawn.attemptId,
      rootSpawn.agentName,
      rootSpawn.role,
      planResult
    );
    const childSpawn = env1.supervisor.assigned[1];
    env1.service.recordCheckpoint(childSpawn.taskId, childSpawn.attemptId, {
      summary: "checkpoint-before-restart"
    });
    env1.close();
    const env2 = createEnvironment({ dbPath: env1.dbPath, run: env1.run });
    const summaries = env2.runLifecycle.recoverInterruptedRuns();
    import_strict.default.equal(summaries.length, 1);
    import_strict.default.deepEqual(summaries[0].resumedTasks, [childSpawn.taskId]);
    summaries[0].resumedTasks.forEach((taskId) => {
      env2.scheduler.handleNewTask(taskId);
    });
    const resumedSpawn = env2.supervisor.assigned[0];
    import_strict.default.ok(resumedSpawn);
    env2.scheduler.handleAgentResult(
      resumedSpawn.taskId,
      resumedSpawn.attemptId,
      resumedSpawn.agentName,
      resumedSpawn.role,
      simpleResult("completed", "child done after restart")
    );
    const verificationSpawn = env2.supervisor.assigned[1];
    import_strict.default.ok(verificationSpawn);
    env2.scheduler.handleAgentResult(
      verificationSpawn.taskId,
      verificationSpawn.attemptId,
      verificationSpawn.agentName,
      verificationSpawn.role,
      simpleResult("completed", "verification passed after restart")
    );
    const reviewSpawn = env2.supervisor.assigned[2];
    import_strict.default.ok(reviewSpawn);
    env2.scheduler.handleAgentResult(
      reviewSpawn.taskId,
      reviewSpawn.attemptId,
      reviewSpawn.agentName,
      reviewSpawn.role,
      simpleResult("completed", "review passed after restart")
    );
    const finalRoot = env2.service.getTask(rootSpawn.taskId);
    import_strict.default.equal(finalRoot?.status, "verified");
    const runBefore = env2.persistence.runs.get(env2.run.runId);
    import_strict.default.equal(runBefore?.status, "running");
    env2.runLifecycle.completeRun(env2.run, "recovery complete");
    const runAfter = env2.persistence.runs.get(env2.run.runId);
    import_strict.default.equal(runAfter?.status, "completed");
    env2.destroy();
  });
});
