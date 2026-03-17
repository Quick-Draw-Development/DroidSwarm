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
var config_exports = {};
__export(config_exports, {
  loadConfig: () => loadConfig
});
module.exports = __toCommonJS(config_exports);
var import_node_path = __toESM(require("node:path"));
var import_specs = require("./specs");
const toPositiveInt = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const parseCommaList = (value) => {
  if (!value) {
    return [];
  }
  return value.split(",").map((part) => part.trim()).filter(Boolean);
};
const loadConfig = () => {
  const environment = process.env.NODE_ENV ?? "development";
  const host = process.env.DROIDSWARM_SOCKET_HOST ?? "127.0.0.1";
  const port = toPositiveInt(process.env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir = process.env.DROIDSWARM_SPECS_DIR ?? import_node_path.default.resolve(__dirname, "..", "..", "..", "packages", "bootstrap", "specs");
  const specs = (0, import_specs.loadSpecCards)(specDir);
  return {
    environment,
    projectId: process.env.DROIDSWARM_PROJECT_ID ?? "droidswarm",
    projectName: process.env.DROIDSWARM_PROJECT_NAME ?? "DroidSwarm",
    projectRoot: process.env.DROIDSWARM_PROJECT_ROOT ?? process.cwd(),
    operatorToken: process.env.DROIDSWARM_OPERATOR_TOKEN,
    agentName: process.env.DROIDSWARM_ORCHESTRATOR_NAME ?? "Orchestrator",
    agentRole: process.env.DROIDSWARM_ORCHESTRATOR_ROLE ?? "control-plane",
    socketUrl: process.env.DROIDSWARM_SOCKET_URL ?? `ws://${host}:${port}`,
    heartbeatMs: toPositiveInt(process.env.DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS, 15e3),
    reconnectMs: toPositiveInt(process.env.DROIDSWARM_ORCHESTRATOR_RECONNECT_MS, 5e3),
    codexBin: process.env.DROIDSWARM_CODEX_BIN ?? "codex",
    codexModel: process.env.DROIDSWARM_CODEX_MODEL,
    codexSandboxMode: process.env.DROIDSWARM_CODEX_SANDBOX_MODE ?? "workspace-write",
    maxAgentsPerTask: toPositiveInt(process.env.DROIDSWARM_MAX_AGENTS_PER_TASK, 4),
    maxConcurrentAgents: toPositiveInt(process.env.DROIDSWARM_MAX_CONCURRENT_AGENTS, 12),
    specDir,
    orchestratorRules: specs.orchestrator,
    droidspeakRules: specs.droidspeak,
    agentRules: specs.agent,
    dbPath: process.env.DROIDSWARM_DB_PATH ?? import_node_path.default.resolve(process.cwd(), "data", "droidswarm.db"),
    schedulerMaxTaskDepth: toPositiveInt(process.env.DROIDSWARM_SCHEDULER_MAX_TASK_DEPTH, 4),
    schedulerMaxFanOut: toPositiveInt(process.env.DROIDSWARM_SCHEDULER_MAX_FAN_OUT, 3),
    schedulerRetryIntervalMs: toPositiveInt(process.env.DROIDSWARM_SCHEDULER_RETRY_INTERVAL_MS, 3e4),
    maxConcurrentCodeAgents: toPositiveInt(process.env.DROIDSWARM_MAX_CONCURRENT_CODE_AGENTS, 6),
    sideEffectActionsBeforeReview: toPositiveInt(
      process.env.DROIDSWARM_SIDE_EFFECT_ACTIONS_BEFORE_REVIEW,
      5
    ),
    allowedTools: parseCommaList(process.env.DROIDSWARM_ALLOWED_TOOLS)
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadConfig
});
