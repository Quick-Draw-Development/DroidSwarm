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
var import_node_test = require("node:test");
var import_OrchestratorEngine = require("./OrchestratorEngine");
var import_worker_registry = require("../worker-registry");
const TEST_CONFIG = {
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
  heartbeatMs: 100,
  reconnectMs: 100,
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
  maxAgentsPerTask: 2,
  maxConcurrentAgents: 2,
  maxConcurrentCodeAgents: 1,
  specDir: "",
  orchestratorRules: "",
  droidspeakRules: "",
  agentRules: "",
  plannerRules: "",
  codingRules: "",
  dbPath: ":memory:",
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 250,
  sideEffectActionsBeforeReview: 0,
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
  budgetMaxConsumed: void 0
};
const toolServiceStub = {
  handleRequest: async () => ({
    status: "error",
    error: "stubbed tool"
  })
};
(0, import_node_test.describe)("OrchestratorEngine status handling", () => {
  (0, import_node_test.it)("fires scheduler and records events from status updates", async () => {
    const recordedEvents = [];
    const persistenceService = {
      recordExecutionEvent: (eventType) => {
        recordedEvents.push(eventType);
      },
      getLatestTaskStateDigest: () => void 0,
      getLatestHandoffPacket: () => void 0
    };
    const schedulerCalls = [];
    const scheduler = {
      handleAgentResult: (taskId, attemptId, agentName, role, result) => {
        schedulerCalls.push({ taskId, attemptId, agentName, role, result });
      }
    };
    const engine = new import_OrchestratorEngine.OrchestratorEngine({
      config: TEST_CONFIG,
      persistenceService,
      scheduler,
      supervisor: {},
      gateway: {
        send: () => void 0,
        watchTaskChannel: () => void 0,
        setMessageHandler: () => void 0
      },
      chatResponder: {},
      controlService: {},
      registry: new import_worker_registry.WorkerRegistry(),
      runLifecycle: {},
      toolService: toolServiceStub
    });
    engine.handleAgentAssignment("task-1", [{
      agentName: "Agent-1",
      taskId: "task-1",
      role: "coder",
      attemptId: "attempt-1"
    }]);
    const agentResult = {
      status: "completed",
      summary: "done",
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: []
    };
    const message = {
      message_id: "msg-1",
      project_id: TEST_CONFIG.projectId,
      room_id: "task-1",
      task_id: "task-1",
      type: "status_update",
      from: {
        actor_type: "agent",
        actor_id: "Agent-1",
        actor_name: "Agent-1"
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        phase: "execution",
        status_code: "agent_completed",
        content: "done",
        result: agentResult
      }
    };
    await engine.handleMessage(message, "task");
    import_strict.default.equal(recordedEvents[0], "agent_result");
    import_strict.default.equal(schedulerCalls.length, 1);
    import_strict.default.equal(schedulerCalls[0].taskId, "task-1");
    import_strict.default.equal(schedulerCalls[0].role, "coder");
    import_strict.default.equal(schedulerCalls[0].result.summary, "done");
  });
  (0, import_node_test.it)("records drift detection when federated hashes do not match persisted continuity state", async () => {
    const recordedEvents = [];
    const persistenceService = {
      recordExecutionEvent: (eventType, _detail, _metadata, transport) => {
        recordedEvents.push({ eventType, transportBody: transport?.transportBody });
      },
      getLatestTaskStateDigest: () => ({ federationHash: "digest-expected" }),
      getLatestHandoffPacket: () => ({ federationHash: "handoff-expected" })
    };
    const scheduler = {
      handleAgentResult: () => void 0
    };
    const engine = new import_OrchestratorEngine.OrchestratorEngine({
      config: TEST_CONFIG,
      persistenceService,
      scheduler,
      supervisor: {},
      gateway: {
        send: () => void 0,
        watchTaskChannel: () => void 0,
        setMessageHandler: () => void 0
      },
      chatResponder: {},
      controlService: {},
      registry: new import_worker_registry.WorkerRegistry(),
      runLifecycle: {},
      toolService: toolServiceStub
    });
    engine.handleAgentAssignment("task-2", [{
      agentName: "Agent-2",
      taskId: "task-2",
      role: "planner",
      attemptId: "attempt-2"
    }]);
    const message = {
      message_id: "msg-drift-1",
      project_id: TEST_CONFIG.projectId,
      room_id: "task-2",
      task_id: "task-2",
      type: "status_update",
      from: {
        actor_type: "agent",
        actor_id: "Agent-2",
        actor_name: "Agent-2"
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        phase: "execution",
        status_code: "agent_completed",
        content: "done",
        metadata: {
          federationNodeId: "node-remote",
          digestHash: "digest-remote",
          handoffHash: "handoff-remote"
        },
        result: {
          status: "completed",
          summary: "done",
          requested_agents: [],
          artifacts: [],
          doc_updates: [],
          branch_actions: []
        }
      }
    };
    await engine.handleMessage(message, "task");
    import_strict.default.equal(recordedEvents[0]?.eventType, "agent_result");
    import_strict.default.equal(recordedEvents[0]?.transportBody?.reportedDigestHash, "digest-remote");
    import_strict.default.equal(recordedEvents[0]?.transportBody?.expectedDigestHash, "digest-expected");
    import_strict.default.equal(recordedEvents[0]?.transportBody?.reportedHandoffHash, "handoff-remote");
    import_strict.default.equal(recordedEvents[0]?.transportBody?.expectedHandoffHash, "handoff-expected");
  });
  (0, import_node_test.it)("records federated drift trace events relayed from the bus", async () => {
    const recordedEvents = [];
    const persistenceService = {
      recordExecutionEvent: (eventType, detail, _metadata, transport) => {
        recordedEvents.push({ eventType, detail, transportBody: transport?.transportBody });
      },
      getLatestTaskStateDigest: () => void 0,
      getLatestHandoffPacket: () => void 0
    };
    const engine = new import_OrchestratorEngine.OrchestratorEngine({
      config: TEST_CONFIG,
      persistenceService,
      scheduler: {},
      supervisor: {},
      gateway: {
        send: () => void 0,
        watchTaskChannel: () => void 0,
        setMessageHandler: () => void 0
      },
      chatResponder: {},
      controlService: {},
      registry: new import_worker_registry.WorkerRegistry(),
      runLifecycle: {},
      toolService: toolServiceStub
    });
    const message = {
      message_id: "msg-trace-1",
      project_id: TEST_CONFIG.projectId,
      room_id: "task-3",
      task_id: "task-3",
      type: "trace_event",
      verb: "drift.detected",
      body: {
        detail: "Federation drift detected for task-3.",
        reportedDigestHash: "digest-remote",
        expectedDigestHash: "digest-local"
      },
      payload: {
        detail: "Federation drift detected for task-3."
      },
      from: {
        actor_type: "agent",
        actor_id: "node-remote",
        actor_name: "node-remote"
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    await engine.handleMessage(message, "task");
    import_strict.default.equal(recordedEvents[0]?.eventType, "agent_result");
    import_strict.default.equal(recordedEvents[0]?.detail, "Federation drift detected for task-3.");
    import_strict.default.equal(recordedEvents[0]?.transportBody?.expectedDigestHash, "digest-local");
  });
});
