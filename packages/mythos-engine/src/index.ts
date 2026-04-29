import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface MythosTaskInput {
  prompt: string;
  maxTokens?: number;
  loops?: number;
  temperature?: number;
}

export interface MythosRuntimeStatus {
  available: boolean;
  enabled: boolean;
  status: 'ready' | 'missing-package' | 'disabled' | 'throttled' | 'halted';
  engineId: string;
  displayName: string;
  spectralRadius: number;
  loopCount: number;
  driftScore: number;
  pid?: number;
  pythonExecutable?: string;
  metadata: Record<string, unknown>;
}

export interface MythosRunResult {
  summary: string;
  success: boolean;
  factsAdded: string[];
  decisionsAdded: string[];
  openQuestions: string[];
  risksFound: string[];
  nextBestActions: string[];
  evidenceRefs: string[];
  metadata: Record<string, unknown>;
}

export interface MythosStabilityReport {
  spectralRadius: number;
  action: 'log' | 'throttle' | 'halt_and_rollback';
  stable: boolean;
}

const resolveDroidSwarmHome = (): string =>
  process.env.DROIDSWARM_HOME != null && process.env.DROIDSWARM_HOME.trim().length > 0
    ? process.env.DROIDSWARM_HOME
    : path.resolve(os.homedir(), '.droidswarm');

const runtimeFile = (): string =>
  path.resolve(resolveDroidSwarmHome(), 'mythos-runtime.json');

const bridgeFile = (): string =>
  path.resolve(__dirname, 'mythos_bridge.py');

const ensureParent = (target: string): void => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
};

const mockEnabled = (): boolean =>
  (process.env.DROIDSWARM_MYTHOS_BRIDGE_MODE ?? '').toLowerCase() === 'mock';

const pythonBin = (): string =>
  process.env.DROIDSWARM_MYTHOS_PYTHON_BIN ?? 'python3';

const readRegistry = (): { runtimes: MythosRuntimeStatus[] } => {
  const target = runtimeFile();
  if (!fs.existsSync(target)) {
    return { runtimes: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8')) as { runtimes: MythosRuntimeStatus[] };
  } catch {
    return { runtimes: [] };
  }
};

const writeRegistry = (runtimes: MythosRuntimeStatus[]): void => {
  const target = runtimeFile();
  ensureParent(target);
  fs.writeFileSync(target, JSON.stringify({ runtimes }, null, 2));
};

const safeAudit = (eventType: string, payload: Record<string, unknown>): void => {
  try {
    if ((process.env.DROIDSWARM_DEBUG ?? '').toLowerCase() === 'true') {
      console.info('[mythos-engine]', eventType, payload);
    }
  } catch {
    // Optional local runtime introspection should not fail because audit persistence is unavailable.
  }
};

const upsertRuntime = (status: MythosRuntimeStatus): MythosRuntimeStatus => {
  const registry = readRegistry();
  const existing = registry.runtimes.filter((entry) => entry.engineId !== status.engineId);
  const updated = [...existing, status];
  writeRegistry(updated);
  return status;
};

const runBridge = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  const args = [bridgeFile(), command];
  if (payload) {
    args.push(JSON.stringify(payload));
  }
  const result = await execFileAsync(pythonBin(), args, {
    env: process.env,
  });
  return JSON.parse(result.stdout) as T;
};

const runBridgeSync = <T>(command: string, payload?: Record<string, unknown>): T => {
  const args = [bridgeFile(), command];
  if (payload) {
    args.push(JSON.stringify(payload));
  }
  const stdout = execFileSync(pythonBin(), args, {
    env: process.env,
    encoding: 'utf8',
  });
  return JSON.parse(stdout) as T;
};

const buildMockStatus = (): MythosRuntimeStatus => ({
  available: true,
  enabled: true,
  status: 'ready',
  engineId: process.env.DROIDSWARM_MYTHOS_ENGINE_ID ?? 'openmythos-local',
  displayName: process.env.DROIDSWARM_MODEL_MYTHOS ?? 'openmythos/local',
  spectralRadius: Number.parseFloat(process.env.DROIDSWARM_MYTHOS_MOCK_SPECTRAL_RADIUS ?? '0.82'),
  loopCount: Number.parseInt(process.env.DROIDSWARM_MYTHOS_MOCK_LOOP_COUNT ?? '4', 10),
  driftScore: Number.parseFloat(process.env.DROIDSWARM_MYTHOS_MOCK_DRIFT_SCORE ?? '0.08'),
  pid: Number.parseInt(process.env.DROIDSWARM_MYTHOS_MOCK_PID ?? '4242', 10),
  pythonExecutable: 'mock',
  metadata: { bridge: 'mock' },
});

export const readMythosRuntimeRegistry = (): MythosRuntimeStatus[] =>
  readRegistry().runtimes;

export const inspectMythosRuntime = async (): Promise<MythosRuntimeStatus> => {
  const enabled = ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_ENABLE_MYTHOS ?? '').toLowerCase());
  if (!enabled && !mockEnabled()) {
    return upsertRuntime({
      available: false,
      enabled: false,
      status: 'disabled',
      engineId: process.env.DROIDSWARM_MYTHOS_ENGINE_ID ?? 'openmythos-local',
      displayName: process.env.DROIDSWARM_MODEL_MYTHOS ?? 'openmythos/local',
      spectralRadius: 0,
      loopCount: 0,
      driftScore: 0,
      metadata: { reason: 'feature-flag-disabled' },
    });
  }

  const status = mockEnabled() ? buildMockStatus() : await runBridge<MythosRuntimeStatus>('status');
  return upsertRuntime(status);
};

export const inspectMythosRuntimeSync = (): MythosRuntimeStatus => {
  const enabled = ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_ENABLE_MYTHOS ?? '').toLowerCase());
  if (!enabled && !mockEnabled()) {
    return upsertRuntime({
      available: false,
      enabled: false,
      status: 'disabled',
      engineId: process.env.DROIDSWARM_MYTHOS_ENGINE_ID ?? 'openmythos-local',
      displayName: process.env.DROIDSWARM_MODEL_MYTHOS ?? 'openmythos/local',
      spectralRadius: 0,
      loopCount: 0,
      driftScore: 0,
      metadata: { reason: 'feature-flag-disabled' },
    });
  }

  const status = mockEnabled() ? buildMockStatus() : runBridgeSync<MythosRuntimeStatus>('status');
  return upsertRuntime(status);
};

export const setMythosLoopCount = async (engineId: string, loopCount: number): Promise<MythosRuntimeStatus> => {
  const current = await inspectMythosRuntime();
  const next: MythosRuntimeStatus = {
    ...current,
    engineId,
    loopCount,
    status: current.spectralRadius >= 0.95 ? 'throttled' : current.status,
    metadata: {
      ...current.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
  safeAudit('MYTHOS_LOOP_OVERRIDE', {
    engineId,
    loopCount,
    spectralRadius: next.spectralRadius,
  });
  return upsertRuntime(next);
};

export const bootstrapMythosRuntime = async (): Promise<MythosRuntimeStatus> => {
  const status = await inspectMythosRuntime();
  safeAudit('MYTHOS_BOOTSTRAP', {
    engineId: status.engineId,
    available: status.available,
    status: status.status,
  });
  return status;
};

export class OpenMythosAdapter {
  async run(task: MythosTaskInput): Promise<MythosRunResult> {
    const payload = mockEnabled()
      ? {
        summary: `OpenMythos mock completed ${task.loops ?? buildMockStatus().loopCount} recurrent loops.`,
        success: true,
        factsAdded: [`Used recurrent reasoning loops=${task.loops ?? buildMockStatus().loopCount}`],
        decisionsAdded: ['Prefer OpenMythos for deep recurrent reasoning.'],
        openQuestions: [],
        risksFound: [],
        nextBestActions: ['Review spectral stability before increasing loops.'],
        evidenceRefs: [],
        metadata: {
          spectralRadius: buildMockStatus().spectralRadius,
          loopCount: task.loops ?? buildMockStatus().loopCount,
          driftScore: Math.min(1, ((task.prompt.length % 17) / 20)),
          pid: buildMockStatus().pid,
        },
      }
      : await runBridge<MythosRunResult>('run', task as unknown as Record<string, unknown>);
    safeAudit('MYTHOS_THINK', {
      loops: task.loops,
      spectralRadius: payload.metadata.spectralRadius,
      driftScore: payload.metadata.driftScore,
    });
    return payload;
  }

  async computeSpectralRadius(): Promise<number> {
    const payload = mockEnabled()
      ? { spectralRadius: buildMockStatus().spectralRadius }
      : await runBridge<{ spectralRadius: number }>('spectral');
    safeAudit('MYTHOS_STATUS', {
      spectralRadius: payload.spectralRadius,
    });
    return payload.spectralRadius;
  }

  async checkDrift(prompt = ''): Promise<number> {
    const payload = mockEnabled()
      ? { driftScore: Math.min(1, ((prompt.length % 17) / 20)) }
      : await runBridge<{ driftScore: number }>('drift', { prompt });
    safeAudit('MYTHOS_DRIFT', {
      driftScore: payload.driftScore,
    });
    return payload.driftScore;
  }

  async evaluateStability(): Promise<MythosStabilityReport> {
    const spectralRadius = await this.computeSpectralRadius();
    return {
      spectralRadius,
      stable: spectralRadius < 1.0,
      action: spectralRadius >= 1.0
        ? 'halt_and_rollback'
        : spectralRadius >= 0.95
          ? 'throttle'
          : 'log',
    };
  }
}
