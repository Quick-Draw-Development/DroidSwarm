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
const createTestConfig = (overrides = {}) => ({
  environment: "test",
  projectId: "droidswarm",
  projectName: "DroidSwarm",
  projectRoot: "/",
  repoId: "droidswarm-repo",
  defaultBranch: "main",
  developBranch: "develop",
  allowedRepoRoots: ["/"],
  workspaceRoot: "/tmp/droidswarm-workspaces",
  agentName: "Orchestrator",
  agentRole: "control-plane",
  socketUrl: "ws://localhost:8765",
  heartbeatMs: 1e3,
  reconnectMs: 1e3,
  codexBin: "codex",
  codexCloudModel: "gpt-5-codex",
  codexApiBaseUrl: "https://api.openai.com/v1",
  codexApiKey: "test-key",
  codexSandboxMode: "workspace-write",
  llamaBaseUrl: "http://127.0.0.1:11434",
  llamaModel: "llama",
  llamaTimeoutMs: 1e3,
  prAutomationEnabled: false,
  prRemoteName: "origin",
  gitPolicy: {
    mainBranch: "main",
    developBranch: "develop",
    prefixes: {
      feature: "feature/",
      hotfix: "hotfix/",
      release: "release/",
      support: "support/"
    }
  },
  maxAgentsPerTask: 4,
  maxConcurrentAgents: 4,
  specDir: "",
  orchestratorRules: "",
  droidspeakRules: "",
  agentRules: "",
  plannerRules: "",
  codingRules: "",
  dbPath: "",
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 1e3,
  maxConcurrentCodeAgents: 2,
  sideEffectActionsBeforeReview: 1,
  allowedTools: [],
  modelRouting: {
    planning: "o1-preview",
    verification: "gpt-4o-mini",
    code: "claude-3.5-sonnet",
    apple: "apple-intelligence/local",
    default: "o1-preview"
  },
  routingPolicy: {
    plannerRoles: ["plan", "planner", "research", "review", "orchestrator", "checkpoint", "compress"],
    appleRoles: ["apple", "ios", "macos", "swift", "swiftui", "xcode", "visionos"],
    appleTaskHints: ["apple", "ios", "ipad", "iphone", "macos", "osx", "swift", "swiftui", "objective-c", "uikit", "appkit", "xcode", "testflight", "visionos", "watchos", "tvos"],
    codeHints: ["code", "coder", "dev", "implementation", "debug", "refactor"],
    cloudEscalationHints: ["refactor", "debug", "multi-file", "migration", "large-scale"]
  },
  budgetMaxConsumed: void 0,
  ...overrides
});
(0, import_node_test.describe)("TaskScheduler", () => {
  (0, import_node_test.it)("schedules tasks, respects dependencies, and reopens parents when children finish", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, model, options) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}`, model, options });
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
    const config = createTestConfig();
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
    const digest = service.getLatestTaskStateDigest(rootTask.taskId);
    import_strict.default.ok(digest);
    const handoffs = service.listHandoffPackets(childTask.taskId);
    import_strict.default.equal(handoffs.length, 1);
    import_strict.default.equal(handoffs[0].toRole, "coder");
    import_strict.default.equal(spawnLog.length, 2, "child task should have been scheduled");
    import_strict.default.equal(spawnLog[0].options?.modelTier, "local-cheap");
    import_strict.default.equal(spawnLog[0].options?.routingTelemetry?.routeKind, "planner-local");
    import_strict.default.equal(spawnLog[1].options?.handoffPacket?.id, handoffs[0].id);
    import_strict.default.equal(spawnLog[1].options?.requiredReads?.[0], handoffs[0].requiredReads[0]);
    import_strict.default.equal(
      (spawnLog[1].options?.compactVerbDictionary ?? {})["handoff.ready"],
      "A helper handoff is ready."
    );
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
  (0, import_node_test.it)("fails parent tasks when required dependencies fail", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, model) {
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
    const config = createTestConfig();
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, config);
    const rootTask = service.createTask({
      taskId: "root",
      name: "Root Plan",
      priority: "medium",
      metadata: {
        description: "Root plan"
      }
    });
    scheduler.handleNewTask(rootTask.taskId);
    const planResult = {
      status: "completed",
      summary: "need help",
      requested_agents: [{
        role: "coder",
        reason: "implement feature",
        instructions: "Do work."
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);
    const childTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId);
    import_strict.default.ok(childTask);
    const childAttempt = spawnLog[1];
    const childResult = {
      status: "completed",
      summary: "could not proceed",
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    scheduler.handleAgentResult(childTask.taskId, childAttempt.attemptId, childAttempt.agentName, childAttempt.role, childResult);
    service.setTaskStatus(childTask.taskId, "failed");
    scheduler.handleNewTask(rootTask.taskId);
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "failed");
    import_strict.default.equal(service.getTask(rootTask.taskId)?.metadata?.blocked_reason, `Dependency ${childTask.taskId} failed`);
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
      startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, model) {
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
    const config = createTestConfig();
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
    const recordedAttempt = service.getAttempt(spawnLog[0].attemptId);
    const recordedPolicy = recordedAttempt?.metadata?.effective_policy;
    import_strict.default.equal(recordedPolicy?.maxTokens, 100);
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
  (0, import_node_test.it)("records global policy defaults with attempts when no overrides exist", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-policy-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, model) {
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
    const config = createTestConfig({
      policyDefaults: {
        maxTokens: 50,
        approvalPolicy: "auto",
        maxParallelHelpers: 3,
        maxSameRoleHelpers: 2,
        localQueueTolerance: 5,
        cloudEscalationAllowed: true,
        priorityBias: "time"
      }
    });
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, config);
    const defaultTask = service.createTask({
      taskId: "default-policy",
      name: "Default Policy Task",
      priority: "medium",
      metadata: {
        description: "Use global defaults",
        task_type: "plan"
      }
    });
    scheduler.handleNewTask(defaultTask.taskId);
    import_strict.default.equal(spawnLog.length, 1);
    const recordedAttempt = service.getAttempt(spawnLog[0].attemptId);
    const recordedPolicy = recordedAttempt?.metadata?.effective_policy;
    import_strict.default.equal(recordedPolicy?.maxTokens, 50);
    import_strict.default.equal(recordedPolicy?.approvalPolicy, "auto");
    import_strict.default.equal(recordedPolicy?.maxParallelHelpers, 3);
    import_strict.default.equal(recordedPolicy?.maxSameRoleHelpers, 2);
    import_strict.default.equal(recordedPolicy?.localQueueTolerance, 5);
    import_strict.default.equal(recordedPolicy?.cloudEscalationAllowed, true);
    import_strict.default.equal(recordedPolicy?.priorityBias, "time");
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("fans out bottleneck helpers before direct execution and records topology snapshots", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-bottleneck-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const run = persistence.createRun("droidswarm");
    const service = new import_service.OrchestratorPersistenceService(persistence, run);
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
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, createTestConfig({
      policyDefaults: {
        maxParallelHelpers: 3,
        maxSameRoleHelpers: 2
      }
    }));
    const rootTask = service.createTask({
      taskId: "allocator-root",
      name: "Allocator root",
      priority: "high",
      metadata: {
        description: "Scan the repo and resolve open architectural questions across the codebase.",
        task_type: "plan"
      }
    });
    service.recordTaskStateDigest({
      id: "digest-allocator-root",
      taskId: rootTask.taskId,
      runId: run.runId,
      projectId: "droidswarm",
      objective: "Resolve bottlenecks before direct implementation.",
      currentPlan: ["Understand repo", "Resolve questions"],
      decisions: [],
      openQuestions: ["Q1", "Q2", "Q3"],
      activeRisks: ["R1", "R2"],
      artifactIndex: [],
      verificationState: "planning",
      lastUpdatedBy: "planner",
      ts: nowIso()
    });
    scheduler.handleNewTask(rootTask.taskId);
    const tasks = service.getTasks().filter((task) => task.parentTaskId === rootTask.taskId);
    import_strict.default.ok(tasks.length >= 2);
    import_strict.default.ok(tasks.some((task) => task.metadata?.canonical_role === "researcher"));
    import_strict.default.ok(tasks.some((task) => task.metadata?.canonical_role === "repo-scanner"));
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "waiting_on_dependency");
    import_strict.default.equal(spawnLog.length, tasks.length);
    const topology = service.getRunRecord().metadata?.topology_snapshot;
    import_strict.default.ok(topology);
    import_strict.default.ok((topology?.helpers?.length ?? 0) >= tasks.length);
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("triggers review gating when side-effect limits are reached", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-side-effects-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task2, role, attemptId, _parentSummary, _parentDroidspeak, model) {
        spawnLog.push({ taskId: task2.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task2.taskId,
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
    const reviewNotifications = [];
    const config = createTestConfig({
      sideEffectActionsBeforeReview: 2
    });
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, config);
    scheduler.setEvents({
      onVerificationRequested: (taskId, _type, _requestedBy, detail) => {
        reviewNotifications.push({ taskId, detail });
      }
    });
    const task = service.createTask({
      taskId: "side-effect-task",
      name: "Side Effect Task",
      priority: "medium",
      metadata: {
        description: "Limit side effects",
        task_type: "plan"
      }
    });
    scheduler.handleNewTask(task.taskId);
    import_strict.default.equal(spawnLog.length, 1);
    scheduler.handleArtifactRecorded(task.taskId, spawnLog[0].attemptId, "artifact-write-1", "side_effect", "write file 1");
    import_strict.default.equal(service.getAttempt(spawnLog[0].attemptId)?.metadata?.side_effect_count, 1);
    scheduler.handleArtifactRecorded(task.taskId, spawnLog[0].attemptId, "artifact-write-2", "side_effect", "write file 2");
    import_strict.default.equal(service.getAttempt(spawnLog[0].attemptId)?.metadata?.side_effect_count, 2);
    const parent = service.getTask(task.taskId);
    import_strict.default.equal(parent?.status, "waiting_on_dependency");
    import_strict.default.equal(reviewNotifications.length, 1);
    import_strict.default.ok(reviewNotifications[0].detail?.includes("Side-effect limit"));
    const dependencies = service.listDependencies(task.taskId);
    const reviewChild = dependencies.map((dependency) => service.getTask(dependency.dependsOnTaskId)).find((child) => child?.metadata?.stage === "review");
    import_strict.default.ok(reviewChild);
    const critics = spawnLog.filter((entry) => entry.role === "critic");
    import_strict.default.equal(critics.length, 2, "Each artifact should spawn a critic agent.");
    const criticStages = service.getTasks().filter((t) => t.metadata?.stage === "artifact_verification");
    import_strict.default.equal(criticStages.length, 2, "Two artifact verification stages should exist.");
    const budgetEvent = database.prepare("SELECT detail FROM budget_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(task.taskId);
    import_strict.default.ok(budgetEvent);
    import_strict.default.ok(budgetEvent.detail.includes("Side-effect limit"));
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("expands repo-scanner fanout in parallel for large repository tasks", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-parallel-scan-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, model, options) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}`, options });
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
      },
      cancelTask() {
        return [];
      }
    };
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, createTestConfig({
      schedulerMaxFanOut: 5,
      maxAgentsPerTask: 5
    }));
    const rootTask = service.createTask({
      taskId: "parallel-root",
      name: "Scan the monorepo",
      priority: "high",
      metadata: {
        description: "Large monorepo workspace with many packages to scan before planning.",
        task_type: "plan"
      }
    });
    scheduler.handleNewTask(rootTask.taskId);
    const planResult = {
      status: "completed",
      summary: "Need repo scanners",
      requested_agents: [{
        role: "repo-scanner",
        reason: "map the relevant packages",
        instructions: "Scan the repository and map relevant code paths."
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);
    const childTasks = service.getTasks().filter((task) => task.parentTaskId === rootTask.taskId);
    import_strict.default.equal(childTasks.length, 3);
    const parallelGroups = new Set(childTasks.map((task) => task.metadata?.parallel_group));
    import_strict.default.equal(parallelGroups.size, 1);
    import_strict.default.ok(childTasks.every((task) => task.metadata?.canonical_role === "repo-scanner"));
    import_strict.default.ok(childTasks.every((task) => task.metadata?.parallel_total === 3));
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("creates an arbiter task when parallel reviewer outputs conflict", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-arbiter-"));
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
      },
      cancelTask() {
        return [];
      }
    };
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, createTestConfig({
      schedulerMaxFanOut: 5,
      maxAgentsPerTask: 5
    }));
    const rootTask = service.createTask({
      taskId: "arbiter-root",
      name: "Review risky change",
      priority: "urgent",
      metadata: {
        description: "High risk change that needs parallel review.",
        task_type: "plan",
        blocked_reason: "high risk"
      }
    });
    scheduler.handleNewTask(rootTask.taskId);
    const planResult = {
      status: "completed",
      summary: "Need multiple reviewers",
      requested_agents: [{
        role: "reviewer",
        reason: "review the risky diff",
        instructions: "Review the proposed change and flag risks."
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);
    const reviewerChildren = service.getTasks().filter((task) => task.parentTaskId === rootTask.taskId);
    import_strict.default.equal(reviewerChildren.length, 2);
    scheduler.handleAgentResult(
      reviewerChildren[0].taskId,
      spawnLog[1].attemptId,
      spawnLog[1].agentName,
      spawnLog[1].role,
      {
        success: true,
        engine: "local-llama",
        model: "llama",
        summary: "Approve the change",
        timedOut: false,
        durationMs: 1e3,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: []
        },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: [],
          nextBestActions: [],
          evidenceRefs: []
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: "approved"
        }
      }
    );
    scheduler.handleAgentResult(
      reviewerChildren[1].taskId,
      spawnLog[2].attemptId,
      spawnLog[2].agentName,
      spawnLog[2].role,
      {
        success: true,
        engine: "local-llama",
        model: "llama",
        summary: "Reject the change because the migration is unsafe",
        timedOut: false,
        durationMs: 1e3,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: []
        },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: ["unsafe_migration"],
          nextBestActions: [],
          evidenceRefs: []
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: "unsafe_migration"
        }
      }
    );
    const arbitrationTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId && task.metadata?.stage === "arbitration");
    import_strict.default.ok(arbitrationTask);
    import_strict.default.equal(arbitrationTask?.metadata?.agent_role, "arbiter");
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("queues checkpoint compression for digest-heavy tasks and resumes parent work after compression", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-compression-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const persistence = import_repositories.PersistenceClient.fromDatabase(database);
    const service = new import_service.OrchestratorPersistenceService(persistence, persistence.createRun("droidswarm"));
    const spawnLog = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary, _parentDroidspeak, _model, options) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}`, options });
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
      },
      cancelTask() {
        return [];
      }
    };
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, createTestConfig({
      schedulerMaxFanOut: 5,
      maxAgentsPerTask: 5
    }));
    const rootTask = service.createTask({
      taskId: "compression-root",
      name: "Long-running root task",
      priority: "medium",
      metadata: {
        description: "Large task with growing context.",
        task_type: "plan"
      }
    });
    service.recordTaskStateDigest({
      id: "digest-heavy",
      taskId: rootTask.taskId,
      runId: service.getRunRecord().runId,
      projectId: "droidswarm",
      objective: "Keep the task moving with compressed state.",
      currentPlan: ["step 1", "step 2", "step 3", "step 4", "step 5"],
      decisions: [],
      openQuestions: ["q1", "q2", "q3", "q4"],
      activeRisks: ["risk-1"],
      artifactIndex: [
        { artifactId: "a1", kind: "summary", summary: "artifact 1" },
        { artifactId: "a2", kind: "summary", summary: "artifact 2" },
        { artifactId: "a3", kind: "summary", summary: "artifact 3" },
        { artifactId: "a4", kind: "summary", summary: "artifact 4" },
        { artifactId: "a5", kind: "summary", summary: "artifact 5" },
        { artifactId: "a6", kind: "summary", summary: "artifact 6" }
      ],
      verificationState: "queued",
      lastUpdatedBy: "planner-1",
      ts: nowIso()
    });
    scheduler.handleNewTask(rootTask.taskId);
    import_strict.default.equal(spawnLog.length, 1);
    import_strict.default.equal(spawnLog[0].role, "checkpoint-compressor");
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "waiting_on_dependency");
    const compressionTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId && task.metadata?.stage === "checkpoint_compression");
    import_strict.default.ok(compressionTask);
    scheduler.handleAgentResult(
      compressionTask.taskId,
      spawnLog[0].attemptId,
      spawnLog[0].agentName,
      spawnLog[0].role,
      {
        success: true,
        engine: "local-llama",
        model: "llama",
        summary: "Compressed the checkpoint state for resumed work",
        timedOut: false,
        durationMs: 1e3,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: []
        },
        checkpointDelta: {
          factsAdded: ["fact-1"],
          decisionsAdded: ["decision-1"],
          openQuestions: [],
          risksFound: [],
          nextBestActions: ["continue"],
          evidenceRefs: ["a1"]
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          compression: {
            scheme: "droidspeak-v2",
            compressed_content: "summary:emitted"
          }
        }
      }
    );
    import_strict.default.equal(service.getTask(compressionTask.taskId)?.status, "completed");
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "waiting_on_dependency");
    import_strict.default.deepEqual(service.getTask(rootTask.taskId)?.metadata?.last_compression_metrics, {
      artifactCount: 6,
      planSize: 5,
      openQuestions: 4,
      activeRisks: 1
    });
    import_strict.default.equal(service.getLatestCheckpoint(rootTask.taskId)?.attemptId, spawnLog[0].attemptId);
    import_strict.default.equal(service.getLatestTaskStateDigest(rootTask.taskId)?.droidspeak?.kind, "plan_status");
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
  (0, import_node_test.it)("forces a local checkpoint-compression pass before large cloud escalations", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-scheduler-pre-cloud-"));
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
      },
      cancelTask() {
        return [];
      }
    };
    const scheduler = new import_TaskScheduler.TaskScheduler(service, supervisorStub, createTestConfig());
    const rootTask = service.createTask({
      taskId: "cloud-root",
      name: "Large refactor task",
      priority: "high",
      metadata: {
        description: "Large-scale multi-file refactor across the codebase.",
        task_type: "implementation",
        agent_role: "coder-backend",
        allow_cloud: true,
        queue_depth: 6,
        fallback_count: 2
      }
    });
    service.recordTaskStateDigest({
      id: "digest-cloud",
      taskId: rootTask.taskId,
      runId: service.getRunRecord().runId,
      projectId: "droidswarm",
      objective: "Prepare the large task for cloud execution.",
      currentPlan: ["scan files", "compress context", "apply refactor"],
      decisions: [],
      openQuestions: ["which packages are coupled?", "what can be isolated?", "which migrations are needed?"],
      activeRisks: [],
      artifactIndex: [
        { artifactId: "ra1", kind: "summary", summary: "repo slice 1" },
        { artifactId: "ra2", kind: "summary", summary: "repo slice 2" },
        { artifactId: "ra3", kind: "summary", summary: "repo slice 3" }
      ],
      verificationState: "queued",
      lastUpdatedBy: "planner-1",
      ts: nowIso()
    });
    scheduler.handleNewTask(rootTask.taskId);
    const compressionTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId && task.metadata?.stage === "checkpoint_compression");
    import_strict.default.ok(compressionTask);
    import_strict.default.equal(spawnLog[0]?.role, "checkpoint-compressor");
    import_strict.default.equal(compressionTask?.metadata?.pre_cloud_compression, true);
    import_strict.default.equal(service.getTask(rootTask.taskId)?.status, "waiting_on_dependency");
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
});
