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
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_shared_git = require("@shared-git");
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
const parseBooleanFlag = (value, fallback = false) => {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};
const envSchema = import_zod.z.object({
  NODE_ENV: import_zod.z.enum(["development", "test", "production"]).default("development"),
  DROIDSWARM_DEBUG: import_zod.z.string().optional(),
  DROIDSWARM_SOCKET_HOST: import_zod.z.string().optional(),
  DROIDSWARM_SOCKET_PORT: import_zod.z.string().optional(),
  DROIDSWARM_SPECS_DIR: import_zod.z.string().optional(),
  DROIDSWARM_ALLOWED_TOOLS: import_zod.z.string().optional(),
  DROIDSWARM_POLICY_ALLOWED_TOOLS: import_zod.z.string().optional(),
  DROIDSWARM_PROJECT_ID: import_zod.z.string().optional(),
  DROIDSWARM_PROJECT_NAME: import_zod.z.string().optional(),
  DROIDSWARM_PROJECT_ROOT: import_zod.z.string().optional(),
  DROIDSWARM_REPO_ID: import_zod.z.string().optional(),
  DROIDSWARM_DEFAULT_BRANCH: import_zod.z.string().optional(),
  DROIDSWARM_DEVELOP_BRANCH: import_zod.z.string().optional(),
  DROIDSWARM_ALLOWED_REPO_ROOTS: import_zod.z.string().optional(),
  DROIDSWARM_WORKSPACE_ROOT: import_zod.z.string().optional(),
  DROIDSWARM_WORKER_HOST_ENTRY: import_zod.z.string().optional(),
  DROIDSWARM_OPERATOR_TOKEN: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_NAME: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_ROLE: import_zod.z.string().optional(),
  DROIDSWARM_SOCKET_URL: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS: import_zod.z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_RECONNECT_MS: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_BIN: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_CLOUD_MODEL: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_API_BASE_URL: import_zod.z.string().optional(),
  DROIDSWARM_CODEX_API_KEY: import_zod.z.string().optional(),
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
  DROIDSWARM_MODEL_APPLE: import_zod.z.string().optional(),
  DROIDSWARM_MODEL_DEFAULT: import_zod.z.string().optional(),
  DROIDSWARM_ROUTING_PLANNER_ROLES: import_zod.z.string().optional(),
  DROIDSWARM_ROUTING_APPLE_ROLES: import_zod.z.string().optional(),
  DROIDSWARM_ROUTING_APPLE_HINTS: import_zod.z.string().optional(),
  DROIDSWARM_ROUTING_CODE_HINTS: import_zod.z.string().optional(),
  DROIDSWARM_ROUTING_CLOUD_HINTS: import_zod.z.string().optional(),
  DROIDSWARM_LLAMA_BASE_URL: import_zod.z.string().optional(),
  DROIDSWARM_LLAMA_MODEL: import_zod.z.string().optional(),
  DROIDSWARM_LLAMA_MODEL_NAME: import_zod.z.string().optional(),
  DROIDSWARM_LLAMA_MODELS_FILE: import_zod.z.string().optional(),
  DROIDSWARM_LLAMA_TIMEOUT_MS: import_zod.z.string().optional(),
  DROIDSWARM_MUX_BASE_URL: import_zod.z.string().optional(),
  DROIDSWARM_MUX_TOKEN: import_zod.z.string().optional(),
  DROIDSWARM_SLACK_BOT_TOKEN: import_zod.z.string().optional(),
  DROIDSWARM_SLACK_API_BASE_URL: import_zod.z.string().optional(),
  DROIDSWARM_BLINK_API_BASE_URL: import_zod.z.string().optional(),
  DROIDSWARM_BLINK_API_TOKEN: import_zod.z.string().optional(),
  DROIDSWARM_PR_AUTOMATION_ENABLED: import_zod.z.string().optional(),
  DROIDSWARM_PR_REMOTE_NAME: import_zod.z.string().optional(),
  DROIDSWARM_PR_BASE_URL: import_zod.z.string().optional(),
  DROIDSWARM_GIT_MAIN_BRANCH: import_zod.z.string().optional(),
  DROIDSWARM_GIT_DEVELOP_BRANCH: import_zod.z.string().optional(),
  DROIDSWARM_GIT_FEATURE_PREFIX: import_zod.z.string().optional(),
  DROIDSWARM_GIT_HOTFIX_PREFIX: import_zod.z.string().optional(),
  DROIDSWARM_GIT_RELEASE_PREFIX: import_zod.z.string().optional(),
  DROIDSWARM_GIT_SUPPORT_PREFIX: import_zod.z.string().optional(),
  DROIDSWARM_BUDGET_MAX_CONSUMED: import_zod.z.string().optional()
});
const loadConfig = () => {
  const env = envSchema.parse(process.env);
  const environment = env.NODE_ENV;
  const droidswarmHome = process.env.DROIDSWARM_HOME ?? import_node_path.default.resolve(process.env.HOME ?? process.cwd(), ".droidswarm");
  const installDir = process.env.DROIDSWARM_INSTALL_DIR ?? import_node_path.default.resolve(droidswarmHome, "install");
  const runtimeDir = process.env.DROIDSWARM_RUNTIME_DIR ?? import_node_path.default.resolve(installDir, "runtime");
  const modelsDir = process.env.DROIDSWARM_MODELS_DIR ?? import_node_path.default.resolve(droidswarmHome, "models");
  const llamaModelsFile = env.DROIDSWARM_LLAMA_MODELS_FILE ?? import_node_path.default.resolve(modelsDir, "inventory.json");
  const availableLlamaModels = (() => {
    if (!import_node_fs.default.existsSync(llamaModelsFile)) {
      return void 0;
    }
    try {
      const payload = JSON.parse(import_node_fs.default.readFileSync(llamaModelsFile, "utf8"));
      const models = Array.isArray(payload.models) ? payload.models : [];
      const normalized = models.filter((model) => typeof model.id === "string" && typeof model.name === "string" && typeof model.path === "string").filter((model) => import_node_fs.default.existsSync(model.path));
      return normalized.length > 0 ? normalized : void 0;
    } catch {
      return void 0;
    }
  })();
  const host = env.DROIDSWARM_SOCKET_HOST ?? "127.0.0.1";
  const port = toPositiveInt(env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir = env.DROIDSWARM_SPECS_DIR ?? import_node_path.default.resolve(__dirname, "..", "..", "..", "packages", "bootstrap", "specs");
  const specs = (0, import_specs.loadSpecCards)(specDir);
  const planningModel = env.DROIDSWARM_MODEL_PLANNING ?? "o1-preview";
  const verificationModel = env.DROIDSWARM_MODEL_VERIFICATION ?? "gpt-4o-mini";
  const codeModel = env.DROIDSWARM_MODEL_CODE ?? "claude-3.5-sonnet";
  const appleModel = env.DROIDSWARM_MODEL_APPLE ?? "apple-intelligence/local";
  const defaultModel = env.DROIDSWARM_MODEL_DEFAULT ?? env.DROIDSWARM_CODEX_MODEL ?? "o1-preview";
  const budgetMaxConsumed = toPositiveIntOrUndefined(env.DROIDSWARM_BUDGET_MAX_CONSUMED);
  const allowedTools = parseCommaList(env.DROIDSWARM_ALLOWED_TOOLS);
  const policyAllowedTools = parseOptionalCommaList(env.DROIDSWARM_POLICY_ALLOWED_TOOLS) ?? (allowedTools.length > 0 ? allowedTools : void 0);
  const projectRoot = env.DROIDSWARM_PROJECT_ROOT ?? process.cwd();
  const repoId = env.DROIDSWARM_REPO_ID ?? `${env.DROIDSWARM_PROJECT_ID ?? "droidswarm"}-repo`;
  const defaultBranch = env.DROIDSWARM_DEFAULT_BRANCH ?? env.DROIDSWARM_GIT_MAIN_BRANCH ?? "main";
  const developBranch = env.DROIDSWARM_DEVELOP_BRANCH ?? env.DROIDSWARM_GIT_DEVELOP_BRANCH ?? "develop";
  const allowedRepoRoots = parseCommaList(env.DROIDSWARM_ALLOWED_REPO_ROOTS);
  const gitPolicy = {
    mainBranch: env.DROIDSWARM_GIT_MAIN_BRANCH ?? import_shared_git.defaultGitPolicy.mainBranch,
    developBranch: env.DROIDSWARM_GIT_DEVELOP_BRANCH ?? import_shared_git.defaultGitPolicy.developBranch,
    prefixes: {
      feature: env.DROIDSWARM_GIT_FEATURE_PREFIX ?? import_shared_git.defaultGitPolicy.prefixes.feature,
      hotfix: env.DROIDSWARM_GIT_HOTFIX_PREFIX ?? import_shared_git.defaultGitPolicy.prefixes.hotfix,
      release: env.DROIDSWARM_GIT_RELEASE_PREFIX ?? import_shared_git.defaultGitPolicy.prefixes.release,
      support: env.DROIDSWARM_GIT_SUPPORT_PREFIX ?? import_shared_git.defaultGitPolicy.prefixes.support
    }
  };
  return {
    environment,
    debug: parseBooleanFlag(env.DROIDSWARM_DEBUG, false),
    projectId: env.DROIDSWARM_PROJECT_ID ?? "droidswarm",
    projectName: env.DROIDSWARM_PROJECT_NAME ?? "DroidSwarm",
    projectRoot,
    repoId,
    defaultBranch,
    developBranch,
    allowedRepoRoots: allowedRepoRoots.length > 0 ? allowedRepoRoots : [projectRoot],
    workspaceRoot: env.DROIDSWARM_WORKSPACE_ROOT ?? import_node_path.default.resolve(projectRoot, ".droidswarm", "workspaces"),
    workerHostEntry: env.DROIDSWARM_WORKER_HOST_ENTRY ?? import_node_path.default.resolve(runtimeDir, "worker-host", "main.js"),
    operatorToken: env.DROIDSWARM_OPERATOR_TOKEN,
    agentName: env.DROIDSWARM_ORCHESTRATOR_NAME ?? "Orchestrator",
    agentRole: env.DROIDSWARM_ORCHESTRATOR_ROLE ?? "control-plane",
    socketUrl: env.DROIDSWARM_SOCKET_URL ?? `ws://${host}:${port}`,
    heartbeatMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS, 15e3),
    reconnectMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_RECONNECT_MS, 5e3),
    codexBin: env.DROIDSWARM_CODEX_BIN ?? "codex",
    codexCloudModel: env.DROIDSWARM_CODEX_CLOUD_MODEL ?? env.DROIDSWARM_CODEX_MODEL,
    codexApiBaseUrl: env.DROIDSWARM_CODEX_API_BASE_URL,
    codexApiKey: env.DROIDSWARM_CODEX_API_KEY,
    codexModel: env.DROIDSWARM_CODEX_MODEL,
    codexSandboxMode: env.DROIDSWARM_CODEX_SANDBOX_MODE,
    llamaBaseUrl: env.DROIDSWARM_LLAMA_BASE_URL ?? process.env.DROIDSWARM_LLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    llamaModel: env.DROIDSWARM_LLAMA_MODEL_NAME ?? env.DROIDSWARM_LLAMA_MODEL ?? availableLlamaModels?.[0]?.id ?? import_node_path.default.resolve(modelsDir, "default.gguf"),
    llamaModelPath: env.DROIDSWARM_LLAMA_MODEL ?? availableLlamaModels?.[0]?.path,
    llamaModelsFile,
    availableLlamaModels,
    llamaTimeoutMs: toPositiveInt(env.DROIDSWARM_LLAMA_TIMEOUT_MS, 6e4),
    muxBaseUrl: env.DROIDSWARM_MUX_BASE_URL,
    muxToken: env.DROIDSWARM_MUX_TOKEN,
    slackBotToken: env.DROIDSWARM_SLACK_BOT_TOKEN,
    slackApiBaseUrl: env.DROIDSWARM_SLACK_API_BASE_URL ?? "https://slack.com/api",
    blinkApiBaseUrl: env.DROIDSWARM_BLINK_API_BASE_URL,
    blinkApiToken: env.DROIDSWARM_BLINK_API_TOKEN,
    prAutomationEnabled: env.DROIDSWARM_PR_AUTOMATION_ENABLED === "1" || env.DROIDSWARM_PR_AUTOMATION_ENABLED === "true",
    prRemoteName: env.DROIDSWARM_PR_REMOTE_NAME ?? "origin",
    prBaseUrl: env.DROIDSWARM_PR_BASE_URL,
    gitPolicy,
    maxAgentsPerTask: toPositiveInt(env.DROIDSWARM_MAX_AGENTS_PER_TASK, 4),
    maxConcurrentAgents: toPositiveInt(env.DROIDSWARM_MAX_CONCURRENT_AGENTS, 12),
    specDir,
    orchestratorRules: specs.orchestrator,
    droidspeakRules: specs.droidspeak,
    agentRules: specs.agent,
    plannerRules: specs.planner,
    codingRules: specs.coding,
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
      apple: appleModel,
      default: defaultModel
    },
    routingPolicy: {
      plannerRoles: parseCommaList(env.DROIDSWARM_ROUTING_PLANNER_ROLES ?? "plan,planner,research,review,orchestrator,checkpoint,compress"),
      appleRoles: parseCommaList(env.DROIDSWARM_ROUTING_APPLE_ROLES ?? "apple,ios,macos,swift,swiftui,xcode,visionos"),
      appleTaskHints: parseCommaList(env.DROIDSWARM_ROUTING_APPLE_HINTS ?? "apple,ios,ipad,iphone,macos,osx,swift,swiftui,objective-c,uikit,appkit,xcode,testflight,visionos,watchos,tvos"),
      codeHints: parseCommaList(env.DROIDSWARM_ROUTING_CODE_HINTS ?? "code,coder,dev,implementation,debug,refactor"),
      cloudEscalationHints: parseCommaList(env.DROIDSWARM_ROUTING_CLOUD_HINTS ?? "refactor,debug,multi-file,migration,large-scale")
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
