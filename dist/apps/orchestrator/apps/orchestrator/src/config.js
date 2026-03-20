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
var import_zod = require("zod");
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
const toPositiveIntOrUndefined = (value) => {
  if (!value) {
    return void 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
};
const parseOptionalCommaList = (value) => {
  if (!value) {
    return void 0;
  }
  const list = parseCommaList(value);
  return list.length > 0 ? list : void 0;
};
const parseApprovalPolicy = (value) => {
  if (value === "auto" || value === "manual") {
    return value;
  }
  return void 0;
};
const envSchema = import_zod.z.object({
  NODE_ENV: import_zod.z.enum(["development", "test", "production"]).default("development"),
  DROIDSWARM_SOCKET_HOST: import_zod.z.string().optional(),
  DROIDSWARM_SOCKET_PORT: import_zod.z.string().optional(),
  DROIDSWARM_SPECS_DIR: import_zod.z.string().optional(),
  DROIDSWARM_ALLOWED_TOOLS: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_ALLOWED_TOOLS: import_zod.z.string().optional(),
  DROIDSWARM_PROJECT_ID: import_zod.z.string().optional(),
  DROIDSWARM_PROJECT_NAME: import_zod.z.string().optional(),
  DROIDSWARM_PROJECT_ROOT: import_zod.z.string().optional(),
  DROIDSWARM_OPERATOR_TOKEN: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_NAME: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_ROLE: import_zod.z.string().optional(),
  DROIDSWARM_SOCKET_URL: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_RECONNECT_MS: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_BIN: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_MODEL: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_SANDBOX_MODE: import_zod.z.enum([
    "read-only",
    "workspace-write",
    "danger-full-access"
  ]).default("workspace-write"),
  DROIDSWARM_MAX_AGENTS_PER_TASK: import_zod.z.string().optional(),
  DROIDSWARM_MAX_CONCURRENT_AGENTS: import_zod.z.string().optional(),
  DROIDSWARM_DB_PATH: import_zod.z.string().optional(),
  DROIDSWARM_SCHEDULER_MAX_TASK_DEPTH: import_zod.z.string().optional(),
  DROIDSWARM_SCHEDULER_MAX_FAN_OUT: import_zod.z.string().optional(),
  DROIDSWARM_SCHEDULER_RETRY_INTERVAL_MS: import_zod.z.string().optional(),
  DROIDSWARM_MAX_CONCURRENT_CODE_AGENTS: import_zod.z.string().optional(),
  DROIDSWARM_SIDE_EFFECT_ACTIONS_BEFORE_REVIEW: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_MAX_DEPTH: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_MAX_CHILDREN: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_MAX_TOKENS: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_MAX_TOOL_CALLS: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_TIMEOUT_MS: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_APPROVAL_POLICY: import_zod.z.enum(["auto", "manual"]).optional(),
  DROIDSWARM_MODEL_PLANNING: import_zod.z.string().optional(),
  DROIDSWARM_MODEL_VERIFICATION: import_zod.z.string().optional(),
  DROIDSWARM_MODEL_CODE: import_zod.z.string().optional(),
  DROIDSWARM_MODEL_DEFAULT: import_zod.z.string().optional(),
  DROIDSWARM_BUDGET_MAX_CONSUMED: import_zod.z.string().optional()
});
const loadConfig = () => {
  const env = envSchema.parse(process.env);
  const environment = env.NODE_ENV;
  const host = env.DROIDSWARM_SOCKET_HOST ?? "127.0.0.1";
  const port = toPositiveInt(env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir = env.DROIDSWARM_SPECS_DIR ?? import_node_path.default.resolve(__dirname, "..", "..", "..", "packages", "bootstrap", "specs");
  const specs = (0, import_specs.loadSpecCards)(specDir);
  const planningModel = env.DROIDSWARM_MODEL_PLANNING ?? "o1-preview";
  const verificationModel = env.DROIDSWARM_MODEL_VERIFICATION ?? "gpt-4o-mini";
  const codeModel = env.DROIDSWARM_MODEL_CODE ?? "claude-3.5-sonnet";
  const defaultModel = env.DROIDSWARM_MODEL_DEFAULT ?? env.DROIDSWARM_CODEX_MODEL ?? "o1-preview";
  const budgetMaxConsumed = toPositiveIntOrUndefined(env.DROIDSWARM_BUDGET_MAX_CONSUMED);
  const allowedTools = parseCommaList(env.DROIDSWARM_ALLOWED_TOOLS);
  const policyAllowedTools = parseOptionalCommaList(env.DROIDSWARM_POLICY_ALLOWED_TOOLS) ?? (allowedTools.length > 0 ? allowedTools : void 0);
  return {
    environment,
    projectId: env.DROIDSWARM_PROJECT_ID ?? "droidswarm",
    projectName: env.DROIDSWARM_PROJECT_NAME ?? "DroidSwarm",
    projectRoot: env.DROIDSWARM_PROJECT_ROOT ?? process.cwd(),
    operatorToken: env.DROIDSWARM_OPERATOR_TOKEN,
    agentName: env.DROIDSWARM_ORCHESTRATOR_NAME ?? "Orchestrator",
    agentRole: env.DROIDSWARM_ORCHESTRATOR_ROLE ?? "control-plane",
    socketUrl: env.DROIDSWARM_SOCKET_URL ?? `ws://${host}:${port}`,
    heartbeatMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS, 15e3),
    reconnectMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_RECONNECT_MS, 5e3),
    codexBin: env.DROIDSWARM_CODEX_BIN ?? "codex",
    codexModel: env.DROIDSWARM_CODEX_MODEL,
    codexSandboxMode: env.DROIDSWARM_CODEX_SANDBOX_MODE,
    maxAgentsPerTask: toPositiveInt(env.DROIDSWARM_MAX_AGENTS_PER_TASK, 4),
    maxConcurrentAgents: toPositiveInt(env.DROIDSWARM_MAX_CONCURRENT_AGENTS, 12),
    specDir,
    orchestratorRules: specs.orchestrator,
    droidspeakRules: specs.droidspeak,
    agentRules: specs.agent,
    dbPath: env.DROIDSWARM_DB_PATH ?? import_node_path.default.resolve(process.cwd(), "data", "droidswarm.db"),
    schedulerMaxTaskDepth: toPositiveInt(env.DROIDSWARM_SCHEDULER_MAX_TASK_DEPTH, 4),
    schedulerMaxFanOut: toPositiveInt(env.DROIDSWARM_SCHEDULER_MAX_FAN_OUT, 3),
    schedulerRetryIntervalMs: toPositiveInt(env.DROIDSWARM_SCHEDULER_RETRY_INTERVAL_MS, 3e4),
    maxConcurrentCodeAgents: toPositiveInt(env.DROIDSWARM_MAX_CONCURRENT_CODE_AGENTS, 6),
    sideEffectActionsBeforeReview: toPositiveInt(
      env.DROIDSWARM_SIDE_EFFECT_ACTIONS_BEFORE_REVIEW,
      5
    ),
    modelRouting: {
      planning: planningModel,
      verification: verificationModel,
      code: codeModel,
      default: defaultModel
    },
    budgetMaxConsumed,
    allowedTools,
    policyDefaults: {
      maxDepth: toPositiveIntOrUndefined(env.DROIDSWARM_POLICY_MAX_DEPTH),
      maxChildren: toPositiveIntOrUndefined(env.DROIDSWARM_POLICY_MAX_CHILDREN),
      maxTokens: toPositiveIntOrUndefined(env.DROIDSWARM_POLICY_MAX_TOKENS),
      maxToolCalls: toPositiveIntOrUndefined(env.DROIDSWARM_POLICY_MAX_TOOL_CALLS),
      timeoutMs: toPositiveIntOrUndefined(env.DROIDSWARM_POLICY_TIMEOUT_MS),
      allowedTools: policyAllowedTools,
      approvalPolicy: parseApprovalPolicy(env.DROIDSWARM_POLICY_APPROVAL_POLICY)
    }
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadConfig
});
