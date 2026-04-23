import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AdbDeviceDescriptor {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized' | 'unknown';
  transportId?: string;
  product?: string;
  model?: string;
  device?: string;
}

export interface FederationBundleManifest {
  version: 1;
  projectId: string;
  swarmId: string;
  generatedAt: string;
  busUrl: string;
  adminUrl?: string;
  nodeId: string;
  runtimeArchivePath?: string;
  metadata?: Record<string, unknown>;
}

export interface FederationOnboardingPlan {
  serial: string;
  remoteDir: string;
  manifestPath: string;
  commands: string[];
}

export interface FederationRemoteWorkerRecord {
  targetId: string;
  serial: string;
  remoteDir: string;
  remoteEntry: string;
  remoteCommand: string;
  roles?: string[];
  engines?: Array<'local-llama' | 'apple-intelligence' | 'codex-cloud' | 'codex-cli'>;
  nodeId?: string;
}

const nowIso = (): string => new Date().toISOString();

const parseToken = (token: string): [string, string] | undefined => {
  const delimiter = token.includes(':') ? ':' : token.includes('=') ? '=' : undefined;
  if (!delimiter) {
    return undefined;
  }
  const [key, value] = token.split(delimiter, 2);
  if (!key || !value) {
    return undefined;
  }
  return [key.trim(), value.trim()];
};

export const parseAdbDevicesOutput = (output: string): AdbDeviceDescriptor[] => {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('List of devices attached'))
    .map((line) => {
      const [serial = '', stateToken = '', ...metadataTokens] = line.split(/\s+/);
      if (!serial) {
        return undefined;
      }

      const metadata = Object.fromEntries(
        metadataTokens
          .map((token) => parseToken(token))
          .filter((entry): entry is [string, string] => entry != null),
      );

      const normalizedState: AdbDeviceDescriptor['state'] =
        stateToken === 'device'
          ? 'device'
          : stateToken === 'offline'
            ? 'offline'
            : stateToken === 'unauthorized'
              ? 'unauthorized'
              : 'unknown';

      return {
        serial,
        state: normalizedState,
        transportId: metadata.transport_id,
        product: metadata.product,
        model: metadata.model,
        device: metadata.device,
      } satisfies AdbDeviceDescriptor;
    })
    .filter((device): device is NonNullable<typeof device> => device != null);
};

export const listAdbDevices = async (adbBin = 'adb'): Promise<AdbDeviceDescriptor[]> => {
  const { stdout } = await execFileAsync(adbBin, ['devices', '-l']);
  return parseAdbDevicesOutput(stdout);
};

export const buildFederationBundleManifest = (input: {
  projectId: string;
  swarmId: string;
  busUrl: string;
  adminUrl?: string;
  nodeId: string;
  runtimeArchivePath?: string;
  metadata?: Record<string, unknown>;
}): FederationBundleManifest => ({
  version: 1,
  projectId: input.projectId,
  swarmId: input.swarmId,
  generatedAt: nowIso(),
  busUrl: input.busUrl,
  adminUrl: input.adminUrl,
  nodeId: input.nodeId,
  runtimeArchivePath: input.runtimeArchivePath,
  metadata: input.metadata,
});

export const writeFederationBundleManifest = (manifestPath: string, manifest: FederationBundleManifest): void => {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
};

export const createAdbOnboardingPlan = (input: {
  serial: string;
  manifestPath: string;
  remoteDir?: string;
}): FederationOnboardingPlan => {
  const remoteDir = input.remoteDir ?? '/sdcard/Android/data/com.droidswarm/files/federation';
  const manifestFileName = path.basename(input.manifestPath);
  return {
    serial: input.serial,
    remoteDir,
    manifestPath: input.manifestPath,
    commands: [
      `adb -s ${input.serial} shell mkdir -p ${remoteDir}`,
      `adb -s ${input.serial} push ${input.manifestPath} ${remoteDir}/${manifestFileName}`,
      `adb -s ${input.serial} shell tar -xzf ${remoteDir}/runtime.tgz -C ${remoteDir}`,
    ],
  };
};

export const buildFederationRemoteWorkerRecord = (input: {
  serial: string;
  remoteDir?: string;
  nodeId?: string;
  roles?: string[];
  engines?: FederationRemoteWorkerRecord['engines'];
}): FederationRemoteWorkerRecord => {
  const remoteDir = input.remoteDir ?? '/sdcard/Android/data/com.droidswarm/files/federation';
  return {
    targetId: `adb-${input.serial}`,
    serial: input.serial,
    remoteDir,
    remoteEntry: `${remoteDir}/runtime/orchestrator/main.js`,
    remoteCommand: 'node',
    nodeId: input.nodeId,
    roles: input.roles,
    engines: input.engines,
  };
};
