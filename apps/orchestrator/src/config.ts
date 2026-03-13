import path from 'node:path';

import { loadSpecCards } from './specs';
import type { OrchestratorConfig } from './types';

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (): OrchestratorConfig => {
  const environment = (process.env.NODE_ENV ?? 'development') as OrchestratorConfig['environment'];
  const host = process.env.DROIDSWARM_SOCKET_HOST ?? '127.0.0.1';
  const port = toPositiveInt(process.env.DROIDSWARM_SOCKET_PORT, 8765);
  const specDir =
    process.env.DROIDSWARM_SPECS_DIR ??
    path.resolve(__dirname, '..', '..', '..', 'packages', 'bootstrap', 'specs');
  const specs = loadSpecCards(specDir);

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
  };
};
