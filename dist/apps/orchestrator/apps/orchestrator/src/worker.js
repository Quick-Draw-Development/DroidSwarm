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
var worker_exports = {};
__export(worker_exports, {
  runWorker: () => runWorker
});
module.exports = __toCommonJS(worker_exports);
var import_node_crypto = require("node:crypto");
var import_ws = __toESM(require("ws"));
var import_shared_types = require("@shared-types");
var import_config = require("./config");
var import_agent_prompt = require("./agent-prompt");
var import_messages = require("./messages");
var import_protocol = require("./protocol");
var import_local_llama = require("./adapters/worker/local-llama.adapter");
var import_mlx = require("./adapters/worker/mlx.adapter");
var import_codex_cloud = require("./adapters/worker/codex-cloud.adapter");
var import_codex_cli = require("./adapters/worker/codex-cli.adapter");
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
const buildHeartbeatPayload = (heartbeat) => ({
  heartbeat,
  result: void 0
});
const resolveScope = (config, options) => ({
  projectId: options.scope?.projectId ?? options.task.projectId ?? config.projectId,
  repoId: options.scope?.repoId ?? options.task.repoId ?? config.repoId,
  rootPath: options.workspacePath ?? options.scope?.rootPath ?? options.task.rootPath ?? config.projectRoot,
  branch: options.scope?.branch ?? options.task.branchName ?? config.defaultBranch,
  workspaceId: options.scope?.workspaceId ?? options.task.workspaceId
});
const getAdapter = (config, engine, workspacePath) => {
  switch (engine) {
    case "local-llama":
      return new import_local_llama.LocalLlamaAdapter({ baseUrl: config.llamaBaseUrl, timeoutMs: config.llamaTimeoutMs });
    case "mlx":
      return new import_mlx.MlxAdapter({
        baseUrl: config.mlx?.baseUrl ?? config.llamaBaseUrl,
        timeoutMs: config.llamaTimeoutMs
      });
    case "apple-intelligence": {
      const { AppleIntelligenceWorkerAdapter } = require("./adapters/worker/apple-intelligence.adapter");
      return new AppleIntelligenceWorkerAdapter({
        model: config.modelRouting.apple,
        sdkEnabled: config.appleIntelligence?.enabled,
        preferredByHost: config.appleIntelligence?.preferredByHost,
        availableTools: config.allowedTools
      });
    }
    case "codex-cloud":
      return new import_codex_cloud.CodexCloudAdapter({
        apiBaseUrl: config.codexApiBaseUrl,
        apiKey: config.codexApiKey,
        model: config.codexCloudModel
      });
    case "codex-cli":
      return new import_codex_cli.CodexCliAdapter({
        config,
        projectRoot: workspacePath
      });
    default:
      return new import_local_llama.LocalLlamaAdapter({ baseUrl: config.llamaBaseUrl, timeoutMs: config.llamaTimeoutMs });
  }
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
      `${options.agentName} started ${options.role} work.`,
      void 0,
      {
        metadata: {
          federationNodeId: config.federationNodeId,
          digestHash: options.taskDigest?.federationHash,
          handoffHash: options.handoffPacket?.federationHash
        }
      }
    )
  );
  console.log(`[Worker ${options.agentName}] notifying orchestrator of start`);
  const promptContent = options.instructions ?? (0, import_agent_prompt.buildAgentPrompt)({
    task: options.task,
    role: options.role,
    agentName: options.agentName,
    parentSummary: options.parentSummary,
    parentDroidspeak: options.parentDroidspeak,
    taskDigest: options.taskDigest,
    handoffPacket: options.handoffPacket,
    projectId: config.projectId,
    projectName: config.projectName,
    specRules: config.agentRules,
    specDroidspeak: config.droidspeakRules
  });
  const scope = resolveScope(config, options);
  const engine = options.engine ?? "local-llama";
  const modelOverride = options.model ?? (engine === "local-llama" ? config.llamaModel : engine === "mlx" ? config.modelRouting.mlx ?? "mlx/local" : engine === "apple-intelligence" ? config.modelRouting.apple : engine === "codex-cloud" ? config.codexCloudModel : config.codexModel);
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
  const heartbeatInterval = setInterval(() => {
    const heartbeat = {
      runId: options.task.taskId,
      taskId: options.task.taskId,
      attemptId: options.attemptId,
      engine,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      elapsedMs: Date.now() - llmStart,
      status: "running",
      modelTier: options.modelTier,
      lastActivity: `running ${options.role}`
    };
    sendMessage(
      socket,
      (0, import_messages.buildAgentStatusUpdate)(
        config,
        options.task.taskId,
        options.task.taskId,
        options.agentName,
        "execution",
        "agent_heartbeat",
        `Heartbeat from ${options.agentName}`,
        void 0,
        {
          ...buildHeartbeatPayload(heartbeat),
          metadata: {
            federationNodeId: config.federationNodeId,
            digestHash: options.taskDigest?.federationHash,
            handoffHash: options.handoffPacket?.federationHash
          }
        }
      )
    );
  }, Math.max(1e3, Math.floor(config.heartbeatMs / 2)));
  let result;
  try {
    console.log(`[Worker ${options.agentName}] launching ${engine} adapter (${options.role})`);
    const adapter = getAdapter(config, engine, scope.rootPath);
    const request = {
      runId: options.task.taskId,
      taskId: options.task.taskId,
      attemptId: options.attemptId,
      role: options.role,
      instructions: promptContent,
      scope,
      engine,
      model: modelOverride,
      skillPacks: options.skillPacks,
      readOnly: options.readOnly,
      context: {
        parentSummary: options.parentSummary,
        parentCheckpoint: options.parentDroidspeak,
        resumePacket: options.skillTexts?.join("\n\n"),
        taskDigest: options.taskDigest,
        handoffPacket: options.handoffPacket,
        requiredReads: options.requiredReads ?? options.handoffPacket?.requiredReads,
        modelTier: options.modelTier,
        routingTelemetry: options.routingTelemetry,
        compactVerbDictionary: options.compactVerbDictionary ?? import_shared_types.COMPACT_VERB_DICTIONARY
      }
    };
    result = await adapter.run(request);
    result.metadata = {
      ...result.metadata ?? {},
      modelTier: options.modelTier,
      queueDepth: options.routingTelemetry?.queueDepth ?? 0,
      fallbackCount: options.routingTelemetry?.fallbackCount ?? 0,
      routeKind: options.routingTelemetry?.routeKind,
      escalationReason: options.routingTelemetry?.escalationReason
    };
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
      success: false,
      engine: "codex-cloud",
      model: modelOverride,
      summary: error instanceof Error ? error.message : "Codex execution failed.",
      timedOut: false,
      durationMs: latencyMs2,
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
        risksFound: ["codex_exec_failed"],
        nextBestActions: [],
        evidenceRefs: []
      },
      artifacts: [],
      spawnRequests: [],
      budget: {},
      metadata: {
        reasonCode: "codex_exec_failed"
      }
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
        {
          result: errorResult,
          metadata: {
            federationNodeId: config.federationNodeId,
            digestHash: options.taskDigest?.federationHash,
            handoffHash: options.handoffPacket?.federationHash
          }
        }
      )
    );
    socket.close();
    return;
  } finally {
    clearInterval(heartbeatInterval);
  }
  const latencyMs = Date.now() - llmStart;
  const usage = {};
  if (result.budget.tokensOut !== void 0) {
    usage.total_tokens = result.budget.tokensOut;
    usage.output_tokens = result.budget.tokensOut;
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
        tokens: result.budget.tokensOut,
        tool_calls: result.activity.toolCalls.length,
        latency_ms: latencyMs,
        duration_ms: result.durationMs || latencyMs,
        model: modelOverride ?? "codex_agent"
      }
    },
    usagePayload
  );
  console.log(`[Worker ${options.agentName}] Codex completed with success=${result.success}`);
  for (const artifact of result.artifacts) {
    sendMessage(
      socket,
      (0, import_messages.buildArtifactCreatedMessage)(config, options.task.taskId, options.task.taskId, options.agentName, artifact)
    );
  }
  for (const request of result.spawnRequests) {
    const normalizedRequest = {
      role: request.role,
      reason: request.reason,
      instructions: request.instructions ?? request.reason
    };
    sendMessage(
      socket,
      (0, import_messages.buildSpawnRequestedMessage)(config, options.task.taskId, options.task.taskId, options.agentName, normalizedRequest)
    );
  }
  const clarificationQuestion = typeof result.metadata?.clarificationQuestion === "string" ? result.metadata.clarificationQuestion : result.checkpointDelta.openQuestions[0];
  if (clarificationQuestion) {
    sendMessage(
      socket,
      (0, import_messages.buildClarificationRequest)(
        config,
        options.task.taskId,
        options.task.taskId,
        options.task.createdByUserId,
        clarificationQuestion
      )
    );
  }
  const compression = typeof result.metadata?.compression === "object" && result.metadata.compression !== null ? result.metadata.compression : void 0;
  sendMessage(
    socket,
    (0, import_messages.buildAgentStatusUpdate)(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      "execution",
      result.success ? "agent_completed" : "agent_blocked",
      result.summary,
      compression,
      {
        result,
        metadata: {
          federationNodeId: config.federationNodeId,
          digestHash: options.taskDigest?.federationHash,
          handoffHash: options.handoffPacket?.federationHash
        }
      }
    )
  );
  socket.close();
};
if (require.main === module) {
  void runWorker();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runWorker
});
