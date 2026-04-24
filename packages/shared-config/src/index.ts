import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GitPolicy } from '@shared-types';
import { defaultGitPolicy } from '@shared-git';

export interface SharedConfig {
  projectId: string;
  dbPath: string;
  socketUrl: string;
  skillsDir: string;
  gitPolicy: GitPolicy;
  swarmRole: FederationNodeRole;
  federationNodeId: string;
  federationConnectTo?: string;
}

export interface AuditSigningKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

export type FederationNodeRole = 'master' | 'slave';

export interface FederationNodeConfig {
  nodeId: string;
  swarmRole: FederationNodeRole;
  connectTo?: string;
  adminUrl?: string;
  busUrl?: string;
  hardwareFingerprintHash: string;
  keyPair: AuditSigningKeyPair;
}

const DEFAULT_SLACK_KEYCHAIN_SERVICE = 'DroidSwarm Slack';
const SLACK_BOT_TOKEN_ACCOUNT = 'droidswarm-slack-bot-token';
const SLACK_APP_TOKEN_ACCOUNT = 'droidswarm-slack-app-token';

export const loadSharedConfig = (): SharedConfig => ({
  projectId: process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
  dbPath: process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'),
  socketUrl: process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765',
  skillsDir: process.env.DROIDSWARM_SKILLS_DIR ?? path.resolve(process.cwd(), 'skills'),
  gitPolicy: defaultGitPolicy,
  swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
  federationNodeId:
    process.env.DROIDSWARM_FEDERATION_NODE_ID
    ?? process.env.DROIDSWARM_SWARM_ID
    ?? process.env.DROIDSWARM_PROJECT_ID
    ?? os.hostname()
    ?? 'droidswarm-local',
  federationConnectTo: process.env.DROIDSWARM_FEDERATION_CONNECT_TO,
});

const normalizePem = (value: string): string => value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
const normalizeSecret = (value: string): string => value.endsWith('\n') ? value.slice(0, -1) : value;

export const resolveSlackKeychainService = (): string =>
  process.env.DROIDSWARM_SLACK_KEYCHAIN_SERVICE ?? DEFAULT_SLACK_KEYCHAIN_SERVICE;

const isMacOs = (): boolean => process.platform === 'darwin';

const readKeychainSecret = (account: string): string | null => {
  if (!isMacOs()) {
    return null;
  }

  try {
    const value = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', resolveSlackKeychainService(), '-a', account],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return normalizeSecret(value);
  } catch {
    return null;
  }
};

const writeKeychainSecret = (account: string, secret: string): void => {
  if (!isMacOs()) {
    throw new Error('Secure Slack token storage is only supported on macOS Keychain.');
  }

  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', resolveSlackKeychainService(), '-a', account, '-w', secret],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
};

const deleteKeychainSecret = (account: string): void => {
  if (!isMacOs()) {
    return;
  }

  try {
    execFileSync(
      'security',
      ['delete-generic-password', '-s', resolveSlackKeychainService(), '-a', account],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );
  } catch {
    // No-op when the key is not present.
  }
};

export const getSecureSlackToken = (): string | null =>
  process.env.DROIDSWARM_SLACK_BOT_TOKEN ?? readKeychainSecret(SLACK_BOT_TOKEN_ACCOUNT);

export const setSecureSlackToken = (token: string): void => {
  writeKeychainSecret(SLACK_BOT_TOKEN_ACCOUNT, token);
};

export const deleteSecureSlackToken = (): void => {
  deleteKeychainSecret(SLACK_BOT_TOKEN_ACCOUNT);
};

export const getSecureAppToken = (): string | null =>
  process.env.DROIDSWARM_SLACK_APP_TOKEN ?? readKeychainSecret(SLACK_APP_TOKEN_ACCOUNT);

export const setSecureAppToken = (token: string): void => {
  writeKeychainSecret(SLACK_APP_TOKEN_ACCOUNT, token);
};

export const deleteSecureAppToken = (): void => {
  deleteKeychainSecret(SLACK_APP_TOKEN_ACCOUNT);
};

export const resolveAuditSigningKeyFile = (dbPath?: string): string => {
  const configured = process.env.DROIDSWARM_AUDIT_SIGNING_KEY_FILE;
  if (configured) {
    return configured;
  }

  if (dbPath) {
    return path.resolve(path.dirname(dbPath), 'audit-signing-keypair.json');
  }

  const shared = loadSharedConfig();
  return path.resolve(path.dirname(shared.dbPath), 'audit-signing-keypair.json');
};

export const resolveFederationSigningKeyFile = (dbPath?: string): string => {
  const configured = process.env.DROIDSWARM_FEDERATION_SIGNING_KEY_FILE;
  if (configured) {
    return configured;
  }

  if (dbPath) {
    return path.resolve(path.dirname(dbPath), 'federation-signing-keypair.json');
  }

  const shared = loadSharedConfig();
  return path.resolve(path.dirname(shared.dbPath), 'federation-signing-keypair.json');
};

export const loadOrCreateAuditSigningKeyPair = (dbPath?: string): AuditSigningKeyPair => {
  const envPrivateKey = process.env.DROIDSWARM_AUDIT_SIGNING_PRIVATE_KEY;
  const envPublicKey = process.env.DROIDSWARM_AUDIT_SIGNING_PUBLIC_KEY;
  if (envPrivateKey && envPublicKey) {
    return {
      privateKeyPem: normalizePem(envPrivateKey),
      publicKeyPem: normalizePem(envPublicKey),
    };
  }

  const keyFile = resolveAuditSigningKeyFile(dbPath);
  if (fs.existsSync(keyFile)) {
    const raw = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as Partial<AuditSigningKeyPair>;
    if (typeof raw.privateKeyPem === 'string' && typeof raw.publicKeyPem === 'string') {
      return {
        privateKeyPem: raw.privateKeyPem,
        publicKeyPem: raw.publicKeyPem,
      };
    }
  }

  const directory = path.dirname(keyFile);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pair: AuditSigningKeyPair = {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };

  fs.writeFileSync(keyFile, JSON.stringify(pair, null, 2), { mode: 0o600 });
  return pair;
};

export const loadOrCreateFederationSigningKeyPair = (dbPath?: string): AuditSigningKeyPair => {
  const envPrivateKey = process.env.DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY;
  const envPublicKey = process.env.DROIDSWARM_FEDERATION_SIGNING_PUBLIC_KEY;
  if (envPrivateKey && envPublicKey) {
    return {
      privateKeyPem: normalizePem(envPrivateKey),
      publicKeyPem: normalizePem(envPublicKey),
    };
  }

  const keyFile = resolveFederationSigningKeyFile(dbPath);
  if (fs.existsSync(keyFile)) {
    const raw = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as Partial<AuditSigningKeyPair>;
    if (typeof raw.privateKeyPem === 'string' && typeof raw.publicKeyPem === 'string') {
      return {
        privateKeyPem: raw.privateKeyPem,
        publicKeyPem: raw.publicKeyPem,
      };
    }
  }

  const directory = path.dirname(keyFile);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pair: AuditSigningKeyPair = {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };

  fs.writeFileSync(keyFile, JSON.stringify(pair, null, 2), { mode: 0o600 });
  return pair;
};

export const isValidAuditSigningKeyPair = (pair: AuditSigningKeyPair): boolean => {
  try {
    createPrivateKey(pair.privateKeyPem);
    createPublicKey(pair.publicKeyPem);
    return true;
  } catch {
    return false;
  }
};

const computeHardwareFingerprintHash = (): string => {
  const payload = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.release(),
    os.cpus()[0]?.model ?? 'unknown-cpu',
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
};

export const loadFederationNodeConfig = (dbPath?: string): FederationNodeConfig => {
  const shared = loadSharedConfig();
  const host = process.env.DROIDSWARM_FEDERATION_HOST ?? '127.0.0.1';
  const busPort = process.env.DROIDSWARM_FEDERATION_BUS_PORT;
  const adminPort = process.env.DROIDSWARM_FEDERATION_ADMIN_PORT;

  return {
    nodeId: shared.federationNodeId,
    swarmRole: shared.swarmRole,
    connectTo: shared.federationConnectTo,
    busUrl: busPort ? `http://${host}:${busPort}` : process.env.DROIDSWARM_FEDERATION_BUS_URL,
    adminUrl: adminPort ? `http://${host}:${adminPort}` : process.env.DROIDSWARM_FEDERATION_ADMIN_URL,
    hardwareFingerprintHash: computeHardwareFingerprintHash(),
    keyPair: loadOrCreateFederationSigningKeyPair(dbPath),
  };
};
