import path from 'node:path';

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
  DROIDSWARM_OPERATOR_TOKEN: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_NAME: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_ROLE: z.string().optional(),
  DROIDSWARM_SOCKET_URL: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS: z.string().optional(),
  DROIDSWARM_ORCHESTRATOR_RECONNECT_MS: z.string().optional(),
  DROIDSWARM_CODEX_BIN: z.string().optional(),
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
  DROIDSWARM_MODEL_DEFAULT: z.string().optional(),
  DROIDSWARM_BUDGET_MAX_CONSUMED: z.string().optional(),
});

export const loadConfig = (): OrchestratorConfig => {
  const env = envSchema.parse(process.env);
  const environment = env.NODE_ENV;
  const host = env.DROIDSWARM_SOCKET_HOST ?? '127.0.0.1';
  const port = toPositiveInt(env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir = env.DROIDSWARM_SPECS_DIR ?? path.resolve(__dirname, '..', '..', '..', 'packages', 'bootstrap', 'specs');
  const specs = loadSpecCards(specDir);
  const planningModel = env.DROIDSWARM_MODEL_PLANNING ?? 'o1-preview';
  const verificationModel = env.DROIDSWARM_MODEL_VERIFICATION ?? 'gpt-4o-mini';
  const codeModel = env.DROIDSWARM_MODEL_CODE ?? 'claude-3.5-sonnet';
  const defaultModel = env.DROIDSWARM_MODEL_DEFAULT ?? env.DROIDSWARM_CODEX_MODEL ?? 'o1-preview';
  const budgetMaxConsumed = toPositiveIntOrUndefined(env.DROIDSWARM_BUDGET_MAX_CONSUMED);
  const allowedTools = parseCommaList(env.DROIDSWARM_ALLOWED_TOOLS);
  const policyAllowedTools =
    parseOptionalCommaList(env.DROIDSWARM_POLICY_ALLOWED_TOOLS) ?? (allowedTools.length > 0 ? allowedTools : undefined);

  return {
    environment,
    projectId: env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
    projectName: env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm',
    projectRoot: env.DROIDSWARM_PROJECT_ROOT ?? process.cwd(),
    operatorToken: env.DROIDSWARM_OPERATOR_TOKEN,
    agentName: env.DROIDSWARM_ORCHESTRATOR_NAME ?? 'Orchestrator',
    agentRole: env.DROIDSWARM_ORCHESTRATOR_ROLE ?? 'control-plane',
    socketUrl: env.DROIDSWARM_SOCKET_URL ?? `ws://${host}:${port}`,
    heartbeatMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS, 15_000),
    reconnectMs: toPositiveInt(env.DROIDSWARM_ORCHESTRATOR_RECONNECT_MS, 5_000),
    codexBin: env.DROIDSWARM_CODEX_BIN ?? 'codex',
    codexModel: env.DROIDSWARM_CODEX_MODEL,
    codexSandboxMode: env.DROIDSWARM_CODEX_SANDBOX_MODE,
    maxAgentsPerTask: toPositiveInt(env.DROIDSWARM_MAX_AGENTS_PER_TASK, 4),
    maxConcurrentAgents: toPositiveInt(env.DROIDSWARM_MAX_CONCURRENT_AGENTS, 12),
    specDir,
    orchestratorRules: specs.orchestrator,
    droidspeakRules: specs.droidspeak,
    agentRules: specs.agent,
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
      default: defaultModel,
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
