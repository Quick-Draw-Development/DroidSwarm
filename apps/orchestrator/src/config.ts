import fs from 'node:fs';
import path from 'node:path';
import { defaultGitPolicy } from '@shared-git';

import { loadSpecCards } from './specs';
import type { OrchestratorConfig, TaskPolicy } from './types';
import { z } from 'zod';

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseCommaList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const toPositiveIntOrUndefined = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const parseOptionalCommaList = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const list = parseCommaList(value);
  return list.length > 0 ? list : undefined;
};

const parseApprovalPolicy = (value: string | undefined): TaskPolicy['approvalPolicy'] | undefined => {
  if (value === 'auto' || value === 'manual') {
    return value;
  }
  return undefined;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DROIDSWARM_SOCKET_HOST: z.string().optional(),
  DROIDSWARM_SOCKET_PORT: z.string().optional(),
  DROIDSWARM_SPECS_DIR: z.string().optional(),
  DROIDSWARM_ALLOWED_TOOLS: z.string().optional(),
  DROIDSWARM_POLICY_ALLOWED_TOOLS: z.string().optional(),
  DROIDSWARM_PROJECT_ID: z.string().optional(),
  DROIDSWARM_PROJECT_NAME: z.string().optional(),
  DROIDSWARM_PROJECT_ROOT: z.string().optional(),
  DROIDSWARM_REPO_ID: z.string().optional(),
  DROIDSWARM_DEFAULT_BRANCH: z.string().optional(),
  DROIDSWARM_DEVELOP_BRANCH: z.string().optional(),
  DROIDSWARM_ALLOWED_REPO_ROOTS: z.string().optional(),
  DROIDSWARM_WORKSPACE_ROOT: z.string().optional(),
  DROIDSWARM_WORKER_HOST_ENTRY: z.string().optional(),
  DROIDSWARM_OPERATOR_TOKEN: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_NAME: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_ROLE: z.string().optional(),
  DROIDSWARM_SOCKET_URL: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_RECONNECT_MS: z.string().optional(),
  DROIDSWARM_CODEX_BIN: z.string().optional(),
  DROIDSWARM_CODEX_CLOUD_MODEL: z.string().optional(),
  DROIDSWARM_CODEX_API_BASE_URL: z.string().optional(),
  DROIDSWARM_CODEX_API_KEY: z.string().optional(),
  DROIDSWARM_CODEX_MODEL: z.string().optional(),
  DROIDSWARM_CODEX_SANDBOX_MODE: z.enum([
    'read-only',
    'workspace-write',
    'danger-full-access',
  ]).default('workspace-write'),
  DROIDSWARM_MAX_AGENTS_PER_TASK: z.string().optional(),
  DROIDSWARM_MAX_CONCURRENT_AGENTS: z.string().optional(),
  DROIDSWARM_DB_PATH: z.string().optional(),
  DROIDSWARM_SCHEDULER_MAX_TASK_DEPTH: z.string().optional(),
  DROIDSWARM_SCHEDULER_MAX_FAN_OUT: z.string().optional(),
  DROIDSWARM_SCHEDULER_RETRY_INTERVAL_MS: z.string().optional(),
  DROIDSWARM_MAX_CONCURRENT_CODE_AGENTS: z.string().optional(),
  DROIDSWARM_SIDE_EFFECT_ACTIONS_BEFORE_REVIEW: z.string().optional(),
  DROIDSWARM_POLICY_MAX_DEPTH: z.string().optional(),
  DROIDSWARM_POLICY_MAX_CHILDREN: z.string().optional(),
  DROIDSWARM_POLICY_MAX_TOKENS: z.string().optional(),
  DROIDSWARM_POLICY_MAX_TOOL_CALLS: z.string().optional(),
  DROIDSWARM_POLICY_TIMEOUT_MS: z.string().optional(),
  DROIDSWARM_POLICY_APPROVAL_POLICY: z.enum(['auto', 'manual']).optional(),
  DROIDSWARM_MODEL_PLANNING: z.string().optional(),
  DROIDSWARM_MODEL_VERIFICATION: z.string().optional(),
  DROIDSWARM_MODEL_CODE: z.string().optional(),
  DROIDSWARM_MODEL_APPLE: z.string().optional(),
  DROIDSWARM_MODEL_DEFAULT: z.string().optional(),
  DROIDSWARM_ROUTING_PLANNER_ROLES: z.string().optional(),
  DROIDSWARM_ROUTING_APPLE_ROLES: z.string().optional(),
  DROIDSWARM_ROUTING_APPLE_HINTS: z.string().optional(),
  DROIDSWARM_ROUTING_CODE_HINTS: z.string().optional(),
  DROIDSWARM_ROUTING_CLOUD_HINTS: z.string().optional(),
  DROIDSWARM_LLAMA_BASE_URL: z.string().optional(),
  DROIDSWARM_LLAMA_MODEL: z.string().optional(),
  DROIDSWARM_LLAMA_MODEL_NAME: z.string().optional(),
  DROIDSWARM_LLAMA_MODELS_FILE: z.string().optional(),
  DROIDSWARM_LLAMA_TIMEOUT_MS: z.string().optional(),
  DROIDSWARM_MUX_BASE_URL: z.string().optional(),
  DROIDSWARM_MUX_TOKEN: z.string().optional(),
  DROIDSWARM_SLACK_BOT_TOKEN: z.string().optional(),
  DROIDSWARM_SLACK_API_BASE_URL: z.string().optional(),
  DROIDSWARM_BLINK_API_BASE_URL: z.string().optional(),
  DROIDSWARM_BLINK_API_TOKEN: z.string().optional(),
  DROIDSWARM_PR_AUTOMATION_ENABLED: z.string().optional(),
  DROIDSWARM_PR_REMOTE_NAME: z.string().optional(),
  DROIDSWARM_PR_BASE_URL: z.string().optional(),
  DROIDSWARM_GIT_MAIN_BRANCH: z.string().optional(),
  DROIDSWARM_GIT_DEVELOP_BRANCH: z.string().optional(),
  DROIDSWARM_GIT_FEATURE_PREFIX: z.string().optional(),
  DROIDSWARM_GIT_HOTFIX_PREFIX: z.string().optional(),
  DROIDSWARM_GIT_RELEASE_PREFIX: z.string().optional(),
  DROIDSWARM_GIT_SUPPORT_PREFIX: z.string().optional(),
  DROIDSWARM_BUDGET_MAX_CONSUMED: z.string().optional(),
});

export const loadConfig = (): OrchestratorConfig => {
  const env = envSchema.parse(process.env);
  const environment = env.NODE_ENV;
  const droidswarmHome = process.env.DROIDSWARM_HOME ?? path.resolve(process.env.HOME ?? process.cwd(), '.droidswarm');
  const installDir = process.env.DROIDSWARM_INSTALL_DIR ?? path.resolve(droidswarmHome, 'install');
  const runtimeDir = process.env.DROIDSWARM_RUNTIME_DIR ?? path.resolve(installDir, 'runtime');
  const modelsDir = process.env.DROIDSWARM_MODELS_DIR ?? path.resolve(droidswarmHome, 'models');
  const llamaModelsFile = env.DROIDSWARM_LLAMA_MODELS_FILE ?? path.resolve(modelsDir, 'inventory.json');
  const availableLlamaModels = (() => {
    if (!fs.existsSync(llamaModelsFile)) {
      return undefined;
    }

    try {
      const payload = JSON.parse(fs.readFileSync(llamaModelsFile, 'utf8')) as {
        models?: Array<{ id?: string; name?: string; tags?: string; path?: string; url?: string }>;
      };
      const models = Array.isArray(payload.models) ? payload.models : [];
      const normalized = models
        .filter((model): model is { id: string; name: string; tags?: string; path: string; url?: string } =>
          typeof model.id === 'string'
          && typeof model.name === 'string'
          && typeof model.path === 'string')
        .filter((model) => fs.existsSync(model.path));
      return normalized.length > 0 ? normalized : undefined;
    } catch {
      return undefined;
    }
  })();
  const host = env.DROIDSWARM_SOCKET_HOST ?? '127.0.0.1';
  const port = toPositiveInt(env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir = env.DROIDSWARM_SPECS_DIR ?? path.resolve(__dirname, '..', '..', '..', 'packages', 'bootstrap', 'specs');
  const specs = loadSpecCards(specDir);
  const planningModel = env.DROIDSWARM_MODEL_PLANNING ?? 'o1-preview';
  const verificationModel = env.DROIDSWARM_MODEL_VERIFICATION ?? 'gpt-4o-mini';
  const codeModel = env.DROIDSWARM_MODEL_CODE ?? 'claude-3.5-sonnet';
  const appleModel = env.DROIDSWARM_MODEL_APPLE ?? 'apple-intelligence/local';
  const defaultModel = env.DROIDSWARM_MODEL_DEFAULT ?? env.DROIDSWARM_CODEX_MODEL ?? 'o1-preview';
  const budgetMaxConsumed = toPositiveIntOrUndefined(env.DROIDSWARM_BUDGET_MAX_CONSUMED);
  const allowedTools = parseCommaList(env.DROIDSWARM_ALLOWED_TOOLS);
  const policyAllowedTools =
    parseOptionalCommaList(env.DROIDSWARM_POLICY_ALLOWED_TOOLS) ?? (allowedTools.length > 0 ? allowedTools : undefined);

  const projectRoot = env.DROIDSWARM_PROJECT_ROOT ?? process.cwd();
  const repoId = env.DROIDSWARM_REPO_ID ?? `${env.DROIDSWARM_PROJECT_ID ?? 'droidswarm'}-repo`;
  const defaultBranch = env.DROIDSWARM_DEFAULT_BRANCH ?? env.DROIDSWARM_GIT_MAIN_BRANCH ?? 'main';
  const developBranch = env.DROIDSWARM_DEVELOP_BRANCH ?? env.DROIDSWARM_GIT_DEVELOP_BRANCH ?? 'develop';
  const allowedRepoRoots = parseCommaList(env.DROIDSWARM_ALLOWED_REPO_ROOTS);
  const gitPolicy = {
    mainBranch: env.DROIDSWARM_GIT_MAIN_BRANCH ?? defaultGitPolicy.mainBranch,
    developBranch: env.DROIDSWARM_GIT_DEVELOP_BRANCH ?? defaultGitPolicy.developBranch,
    prefixes: {
      feature: env.DROIDSWARM_GIT_FEATURE_PREFIX ?? defaultGitPolicy.prefixes.feature,
      hotfix: env.DROIDSWARM_GIT_HOTFIX_PREFIX ?? defaultGitPolicy.prefixes.hotfix,
      release: env.DROIDSWARM_GIT_RELEASE_PREFIX ?? defaultGitPolicy.prefixes.release,
      support: env.DROIDSWARM_GIT_SUPPORT_PREFIX ?? defaultGitPolicy.prefixes.support,
    },
  };

  return {
    environment,
    projectId: env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
    projectName: env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm',
    projectRoot,
    repoId,
    defaultBranch,
    developBranch,
    allowedRepoRoots: allowedRepoRoots.length > 0 ? allowedRepoRoots : [projectRoot],
    workspaceRoot: env.DROIDSWARM_WORKSPACE_ROOT ?? path.resolve(projectRoot, '.droidswarm', 'workspaces'),
    workerHostEntry: env.DROIDSWARM_WORKER_HOST_ENTRY ?? path.resolve(runtimeDir, 'worker-host', 'main.js'),
    operatorToken: env.DROIDSWARM_OPERATOR_TOKEN,
    agentName: env.DROIDSWARM_ORCHESTRATOR_NAME ?? 'Orchestrator',
    agentRole: env.DROIDSWARM_ORCHESTRATOR_ROLE ?? 'control-plane',
    socketUrl: env.DROIDSWARM_SOCKET_URL ?? `ws://${host}:${port}`,
    heartbeatMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS, 15_000),
    reconnectMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_RECONNECT_MS, 5_000),
    codexBin: env.DROIDSWARM_CODEX_BIN ?? 'codex',
    codexCloudModel: env.DROIDSWARM_CODEX_CLOUD_MODEL ?? env.DROIDSWARM_CODEX_MODEL,
    codexApiBaseUrl: env.DROIDSWARM_CODEX_API_BASE_URL,
    codexApiKey: env.DROIDSWARM_CODEX_API_KEY,
    codexModel: env.DROIDSWARM_CODEX_MODEL,
    codexSandboxMode: env.DROIDSWARM_CODEX_SANDBOX_MODE,
    llamaBaseUrl: env.DROIDSWARM_LLAMA_BASE_URL ?? process.env.DROIDSWARM_LLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    llamaModel: env.DROIDSWARM_LLAMA_MODEL_NAME
      ?? env.DROIDSWARM_LLAMA_MODEL
      ?? availableLlamaModels?.[0]?.id
      ?? path.resolve(modelsDir, 'default.gguf'),
    llamaModelPath: env.DROIDSWARM_LLAMA_MODEL ?? availableLlamaModels?.[0]?.path,
    llamaModelsFile,
    availableLlamaModels,
    llamaTimeoutMs: toPositiveInt(env.DROIDSWARM_LLAMA_TIMEOUT_MS, 60_000),
    muxBaseUrl: env.DROIDSWARM_MUX_BASE_URL,
    muxToken: env.DROIDSWARM_MUX_TOKEN,
    slackBotToken: env.DROIDSWARM_SLACK_BOT_TOKEN,
    slackApiBaseUrl: env.DROIDSWARM_SLACK_API_BASE_URL ?? 'https://slack.com/api',
    blinkApiBaseUrl: env.DROIDSWARM_BLINK_API_BASE_URL,
    blinkApiToken: env.DROIDSWARM_BLINK_API_TOKEN,
    prAutomationEnabled: env.DROIDSWARM_PR_AUTOMATION_ENABLED === '1' || env.DROIDSWARM_PR_AUTOMATION_ENABLED === 'true',
    prRemoteName: env.DROIDSWARM_PR_REMOTE_NAME ?? 'origin',
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
    dbPath: env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'),
    schedulerMaxTaskDepth: toPositiveInt(env.DROIDSWARM_SCHEDULER_MAX_TASK_DEPTH, 4),
    schedulerMaxFanOut: toPositiveInt(env.DROIDSWARM_SCHEDULER_MAX_FAN_OUT, 3),
    schedulerRetryIntervalMs: toPositiveInt(env.DROIDSWARM_SCHEDULER_RETRY_INTERVAL_MS, 30_000),
    maxConcurrentCodeAgents: toPositiveInt(env.DROIDSWARM_MAX_CONCURRENT_CODE_AGENTS, 6),
    sideEffectActionsBeforeReview: toPositiveInt(
      env.DROIDSWARM_SIDE_EFFECT_ACTIONS_BEFORE_REVIEW,
      5,
    ),
    modelRouting: {
      planning: planningModel,
      verification: verificationModel,
      code: codeModel,
      apple: appleModel,
      default: defaultModel,
    },
    routingPolicy: {
      plannerRoles: parseCommaList(env.DROIDSWARM_ROUTING_PLANNER_ROLES ?? 'plan,planner,research,review,orchestrator,checkpoint,compress'),
      appleRoles: parseCommaList(env.DROIDSWARM_ROUTING_APPLE_ROLES ?? 'apple,ios,macos,swift,swiftui,xcode,visionos'),
      appleTaskHints: parseCommaList(env.DROIDSWARM_ROUTING_APPLE_HINTS ?? 'apple,ios,ipad,iphone,macos,osx,swift,swiftui,objective-c,uikit,appkit,xcode,testflight,visionos,watchos,tvos'),
      codeHints: parseCommaList(env.DROIDSWARM_ROUTING_CODE_HINTS ?? 'code,coder,dev,implementation,debug,refactor'),
      cloudEscalationHints: parseCommaList(env.DROIDSWARM_ROUTING_CLOUD_HINTS ?? 'refactor,debug,multi-file,migration,large-scale'),
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
      approvalPolicy: parseApprovalPolicy(env.DROIDSWARM_POLICY_APPROVAL_POLICY),
    },
  };
};
