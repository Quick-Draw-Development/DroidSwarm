var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var OrchestratorClient_exports = {};
__export(OrchestratorClient_exports, {
  DroidSwarmOrchestratorClient: () => DroidSwarmOrchestratorClient
});
module.exports = __toCommonJS(OrchestratorClient_exports);
var import_ws = __toESM(require("ws"));
var import_node_path = __toESM(require("node:path"));
var import_AgentSupervisor = require("./AgentSupervisor");
var import_config = require("./config");
var import_codex_runner = require("./codex-runner");
var import_messages = require("./messages");
var import_protocol = require("./protocol");
var import_task_registry = require("./task-registry");
var import_task_events = require("./task-events");
var import_operator_notifications = require("./operator-notifications");
class DroidSwarmOrchestratorClient {
  constructor(config = (0, import_config.loadConfig)()) {
    this.config = config;
    this.stopped = false;
    this.registry = new import_task_registry.TaskRegistry();
    this.supervisor = new import_AgentSupervisor.AgentSupervisor(
      config,
      this.registry,
      import_node_path.default.resolve(__dirname, "main.js"),
      {
        onAgentsAssigned: (taskId, agents) => this.reportAgentAssignment(taskId, agents),
        onAgentCommunication: (taskId, message) => this.reportAgentCommunication(taskId, message)
      }
    );
  }
  start() {
    this.connect();
  }
  stop() {
    this.stopped = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = void 0;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = void 0;
    }
    this.socket?.close();
  }
  connect() {
    const socket = new import_ws.default(this.config.socketUrl);
    this.socket = socket;
    console.log("Connecting to socket server at", this.config.socketUrl);
    socket.on("open", () => {
      this.sendRaw((0, import_protocol.buildAuthMessage)(this.config));
      this.startHeartbeat();
      console.log("Orchestrator connection established.");
    });
    socket.on("message", (raw) => {
      void this.handleMessage(raw.toString());
    });
    socket.on("close", () => {
      this.clearHeartbeat();
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, this.config.reconnectMs);
      }
    });
    socket.on("error", () => {
      socket.close();
    });
  }
  async handleMessage(raw) {
    let message;
    try {
      message = (0, import_protocol.parseEnvelope)(raw);
    } catch {
      return;
    }
    if (message.project_id !== this.config.projectId || message.from.actor_name === this.config.agentName) {
      return;
    }
    if (message.type === "status_update" && message.room_id === "operator") {
      this.handleOperatorStatusMessage(message);
      return;
    }
    if (message.type === "task_created") {
      const task = (0, import_task_events.resolveTaskFromMessage)(message);
      if (!task) {
        return;
      }
      this.registry.register(task);
      this.sendRaw((0, import_protocol.buildTaskIntakeAccepted)(this.config, task.taskId));
      this.supervisor.startInitialAgents(task);
      return;
    }
    if ((0, import_task_events.isCancellationMessage)(message)) {
      const task = (0, import_task_events.resolveTaskFromMessage)(message);
      if (!task) {
        return;
      }
      const removedAgents = this.supervisor.cancelTask(task.taskId);
      this.sendRaw(
        (0, import_task_events.buildTaskCancellationAcknowledged)(
          this.config.projectId,
          this.config.agentName,
          task.taskId,
          removedAgents
        )
      );
      return;
    }
    if (message.type === "chat" && message.room_id === "operator") {
      const content = typeof message.payload.content === "string" ? message.payload.content : "";
      if (!content) {
        return;
      }
      this.sendRaw(
        (0, import_messages.buildOrchestratorStatusUpdate)(
          this.config,
          "operator",
          "operator_instruction",
          "processing_instruction",
          "Processing operator instruction."
        )
      );
      try {
        const instructionSections = [
          this.config.orchestratorRules ? `Orchestrator rules:
${this.config.orchestratorRules}
` : void 0,
          this.config.droidspeakRules ? `Droidspeak reference (droidspeak-v1):
${this.config.droidspeakRules}
` : void 0
        ].filter(Boolean);
        const promptParts = [
          ...instructionSections,
          `You are ${this.config.agentName}, the DroidSwarm orchestrator for project ${this.config.projectName}.`,
          "Respond to the human operator message succinctly.",
          "If the message is an instruction, acknowledge it and state the next orchestration action.",
          "Do not fabricate task state or claim work that has not happened.",
          "Return a structured result with no spawned agents unless the operator explicitly asks for a new task workflow.",
          "",
          `Operator message: ${content}`
        ];
        const result = await (0, import_codex_runner.runCodexPrompt)({
          config: this.config,
          projectRoot: this.config.projectRoot,
          prompt: promptParts.join("\n")
        });
        this.sendRaw((0, import_messages.buildOperatorChatResponse)(this.config, result.summary));
      } catch (error) {
        this.sendRaw(
          (0, import_messages.buildOperatorChatResponse)(
            this.config,
            error instanceof Error ? error.message : "Failed to process operator instruction."
          )
        );
      }
    }
  }
  handleOperatorStatusMessage(message) {
    const metadata = typeof message.payload.metadata === "object" && message.payload.metadata !== null ? message.payload.metadata : void 0;
    const taskId = message.task_id ?? (typeof metadata?.task_id === "string" ? metadata.task_id : void 0);
    if (!taskId) {
      return;
    }
    const status = typeof metadata?.status === "string" ? metadata.status : void 0;
    if (status === "review") {
      this.sendTaskChannelUpdate(
        taskId,
        "operator",
        "operator_review",
        (0, import_operator_notifications.buildReviewAnnouncement)(message.from.actor_name)
      );
    }
  }
  reportAgentAssignment(taskId, agents) {
    if (!agents.length) {
      return;
    }
    const details = agents.map((agent) => `${agent.agentName} (${agent.role})`).join(", ");
    this.sendTaskChannelUpdate(taskId, "execution", "agent_assigned", `Assigned agents: ${details}.`);
  }
  reportAgentCommunication(taskId, content) {
    this.sendTaskChannelUpdate(taskId, "execution", "agent_communication", content);
  }
  sendTaskChannelUpdate(taskId, phase, statusCode, content) {
    this.sendRaw((0, import_messages.buildOrchestratorStatusUpdate)(this.config, taskId, phase, statusCode, content, taskId));
  }
  startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw((0, import_protocol.buildHeartbeatMessage)(this.config));
    }, this.config.heartbeatMs);
  }
  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = void 0;
    }
  }
  sendRaw(message) {
    if (!this.socket || this.socket.readyState !== import_ws.default.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DroidSwarmOrchestratorClient
});
