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
var import_node_crypto = require("node:crypto");
var import_ws = __toESM(require("ws"));
var import_config = require("./config");
var import_agent_prompt = require("./agent-prompt");
var import_codex_runner = require("./codex-runner");
var import_messages = require("./messages");
var import_protocol = require("./protocol");
const parseOptions = () => {
  const raw = process.argv[3];
  if (!raw) {
    throw new Error("Missing worker payload.");
  }
  return JSON.parse(raw);
};
const waitForSocketOpen = (socket) => new Promise((resolve, reject) => {
  socket.on("open", () => resolve());
  socket.on("error", reject);
});
const waitForAuthReady = (socket) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error("Timed out waiting for agent auth confirmation."));
  }, 2e3);
  socket.on("message", (raw) => {
    try {
      const message = (0, import_protocol.parseEnvelope)(raw.toString());
      const statusCode = message.payload.hasOwnProperty("status_code") && typeof message.payload.status_code === "string" ? message.payload.status_code : "";
      if (message.type === "status_update" && statusCode === "ready") {
        clearTimeout(timeout);
        resolve();
      }
    } catch {
    }
  });
  socket.on("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});
const sendMessage = (socket, message) => {
  socket.send(JSON.stringify(message));
};
const runWorker = async () => {
  const config = (0, import_config.loadConfig)();
  const options = parseOptions();
  const socket = new import_ws.default(config.socketUrl);
  await waitForSocketOpen(socket);
  sendMessage(socket, {
    ...(0, import_protocol.buildAuthMessage)(config),
    payload: {
      room_id: options.task.taskId,
      agent_name: options.agentName,
      agent_role: options.role,
      client_type: "agent"
    }
  });
  await waitForAuthReady(socket);
  console.log(`[Worker ${options.agentName}] authenticated for ${options.role} on ${options.task.taskId}`);
  sendMessage(
    socket,
    (0, import_messages.buildAgentStatusUpdate)(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      "execution",
      "agent_started",
      `${options.agentName} started ${options.role} work.`
    )
  );
  console.log(`[Worker ${options.agentName}] notifying orchestrator of start`);
  const promptContent = (0, import_agent_prompt.buildAgentPrompt)({
    task: options.task,
    role: options.role,
    agentName: options.agentName,
    parentSummary: options.parentSummary,
    parentDroidspeak: options.parentDroidspeak,
    projectId: config.projectId,
    projectName: config.projectName,
    specRules: config.agentRules,
    specDroidspeak: config.droidspeakRules
  });
  const modelOverride = options.model ?? config.codexModel;
  const reportLLMCall = (payload, usage2) => {
    sendMessage(
      socket,
      (0, import_messages.buildAgentToolResponseMessage)(
        config,
        options.task.taskId,
        options.task.taskId,
        options.agentName,
        payload,
        usage2
      )
    );
  };
  const llmStart = Date.now();
  let result;
  try {
    console.log(`[Worker ${options.agentName}] launching Codex prompt (${options.role})`);
    result = await (0, import_codex_runner.runCodexPrompt)({
      config,
      projectRoot: config.projectRoot,
      prompt: promptContent,
      model: modelOverride
    });
  } catch (error) {
    const latencyMs2 = Date.now() - llmStart;
    reportLLMCall({
      request_id: (0, import_node_crypto.randomUUID)(),
      status: "error",
      error: error instanceof Error ? error.message : "Codex execution failed.",
      result: {
        tool_name: "codex_agent",
        prompt: promptContent,
        latency_ms: latencyMs2,
        model: modelOverride ?? "codex_agent",
        error: error instanceof Error ? error.message : "Codex execution failed."
      }
    });
    const errorResult = {
      status: "blocked",
      summary: error instanceof Error ? error.message : "Codex execution failed.",
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
      reason_code: "codex_exec_failed"
    };
    sendMessage(
      socket,
      (0, import_messages.buildAgentStatusUpdate)(
        config,
        options.task.taskId,
        options.task.taskId,
        options.agentName,
        "execution",
        "agent_failed",
        error instanceof Error ? error.message : "Codex execution failed.",
        void 0,
        { result: errorResult }
      )
    );
    socket.close();
    return;
  }
  const latencyMs = Date.now() - llmStart;
  const usage = {};
  if (result.metrics?.tokens !== void 0) {
    usage.total_tokens = result.metrics.tokens;
    usage.output_tokens = result.metrics.tokens;
  }
  const usagePayload = Object.keys(usage).length > 0 ? usage : void 0;
  reportLLMCall(
    {
      request_id: (0, import_node_crypto.randomUUID)(),
      status: "success",
      result: {
        tool_name: "codex_agent",
        prompt: promptContent,
        output: result.summary,
        tokens: result.metrics?.tokens,
        tool_calls: result.metrics?.tool_calls,
        latency_ms: latencyMs,
        duration_ms: result.metrics?.duration_ms ?? latencyMs,
        model: modelOverride ?? "codex_agent"
      }
    },
    usagePayload
  );
  console.log(`[Worker ${options.agentName}] Codex completed with status ${result.status}`);
  for (const artifact of result.artifacts) {
    sendMessage(
      socket,
      (0, import_messages.buildArtifactCreatedMessage)(config, options.task.taskId, options.task.taskId, options.agentName, artifact)
    );
  }
  for (const request of result.requested_agents) {
    sendMessage(
      socket,
      (0, import_messages.buildSpawnRequestedMessage)(config, options.task.taskId, options.task.taskId, options.agentName, request)
    );
  }
  if (result.clarification_question) {
    sendMessage(
      socket,
      (0, import_messages.buildClarificationRequest)(
        config,
        options.task.taskId,
        options.task.taskId,
        options.task.createdByUserId,
        result.clarification_question
      )
    );
  }
  sendMessage(
    socket,
    (0, import_messages.buildAgentStatusUpdate)(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      "execution",
      result.status === "completed" ? "agent_completed" : "agent_blocked",
      result.summary,
      result.compression,
      { result }
    )
  );
  socket.close();
};
if (require.main === module) {
  void runWorker();
}
