import path from 'node:path';

import { loadSpecCards } from './specs';
import type { OrchestratorConfig, TaskPolicy } from './types';

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

export const loadConfig = (): OrchestratorConfig => {
  const environment = (process.env.NODE_ENV ?? 'development') as OrchestratorConfig['environment'];
  const host = process.env.DROIDSWARM_SOCKET_HOST ?? '127.0.0.1';
  const port = toPositiveInt(process.env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir =
    process.env.DROIDSWARM_SPECS_DIR ??
    path.resolve(__dirname, '..', '..', '..', 'packages', 'bootstrap', 'specs');
  const specs = loadSpecCards(specDir);
  const allowedTools = parseCommaList(process.env.DROIDSWARM_ALLOWED_TOOLS);
  const policyAllowedTools =
    parseOptionalCommaList(process.env.DROIDSWARM_POLICY_ALLOWED_TOOLS) ?? (allowedTools.length > 0 ? allowedTools : undefined);

  return {
    environment,
    projectId: process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
    projectName: process.env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm',
    projectRoot: process.env.DROIDSWARM_PROJECT_ROOT ?? process.cwd(),
    operatorToken: process.env.DROIDSWARM_OPERATOR_TOKEN,
    agentName: process.env.DROIDSWARM_ORCHESTRATOR_NAME ?? 'Orchestrator',
    agentRole: process.env.DROIDSWARM_ORCHESTRATOR_ROLE ?? 'control-plane',
    socketUrl: process.env.DROIDSWARM_SOCKET_URL ?? `ws://${host}:${port}`,
    heartbeatMs: toPositiveInt(process.env.DROIDSWARM_ORCHESTRATOR_HEARTBEAT_MS, 15_000),
    reconnectMs: toPositiveInt(process.env.DROIDSWARM_ORCHESTRATOR_RECONNECT_MS, 5_000),
    codexBin: process.env.DROIDSWARM_CODEX_BIN ?? 'codex',
    codexModel: process.env.DROIDSWARM_CODEX_MODEL,
    codexSandboxMode: (
      process.env.DROIDSWARM_CODEX_SANDBOX_MODE ?? 'workspace-write'
    ) as OrchestratorConfig['codexSandboxMode'],
    maxAgentsPerTask: toPositiveInt(process.env.DROIDSWARM_MAX_AGENTS_PER_TASK, 4),
    maxConcurrentAgents: toPositiveInt(process.env.DROIDSWARM_MAX_CONCURRENT_AGENTS, 12),
    specDir,
    orchestratorRules: specs.orchestrator,
    droidspeakRules: specs.droidspeak,
    agentRules: specs.agent,
    dbPath: process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'),
    schedulerMaxTaskDepth: toPositiveInt(process.env.DROIDSWARM_SCHEDULER_MAX_TASK_DEPTH, 4),
    schedulerMaxFanOut: toPositiveInt(process.env.DROIDSWARM_SCHEDULER_MAX_FAN_OUT, 3),
    schedulerRetryIntervalMs: toPositiveInt(process.env.DROIDSWARM_SCHEDULER_RETRY_INTERVAL_MS, 30_000),
    maxConcurrentCodeAgents: toPositiveInt(process.env.DROIDSWARM_MAX_CONCURRENT_CODE_AGENTS, 6),
    sideEffectActionsBeforeReview: toPositiveInt(
      process.env.DROIDSWARM_SIDE_EFFECT_ACTIONS_BEFORE_REVIEW,
      5,
    ),
    allowedTools,
    policyDefaults: {
      maxDepth: toPositiveIntOrUndefined(process.env.DROIDSWARM_POLICY_MAX_DEPTH),
      maxChildren: toPositiveIntOrUndefined(process.env.DROIDSWARM_POLICY_MAX_CHILDREN),
      maxTokens: toPositiveIntOrUndefined(process.env.DROIDSWARM_POLICY_MAX_TOKENS),
      maxToolCalls: toPositiveIntOrUndefined(process.env.DROIDSWARM_POLICY_MAX_TOOL_CALLS),
      timeoutMs: toPositiveIntOrUndefined(process.env.DROIDSWARM_POLICY_TIMEOUT_MS),
      allowedTools: policyAllowedTools,
      approvalPolicy: parseApprovalPolicy(process.env.DROIDSWARM_POLICY_APPROVAL_POLICY),
    },
  };
};
