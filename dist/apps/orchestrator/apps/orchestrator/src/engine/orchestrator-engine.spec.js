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
var import_OrchestratorEngine = require("./OrchestratorEngine");
var import_worker_registry = require("../worker-registry");
const TEST_CONFIG = {
  environment: "test",
  projectId: "droidswarm",
  projectName: "DroidSwarm",
  projectRoot: "/",
  agentName: "Orchestrator",
  agentRole: "control-plane",
  socketUrl: "ws://localhost:8765",
  heartbeatMs: 100,
  reconnectMs: 100,
  codexBin: "codex",
  codexSandboxMode: "workspace-write",
  maxAgentsPerTask: 2,
  maxConcurrentAgents: 2,
  maxConcurrentCodeAgents: 1,
  specDir: "",
  orchestratorRules: "",
  droidspeakRules: "",
  agentRules: "",
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
    default: "o1-preview"
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
      }
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
});
