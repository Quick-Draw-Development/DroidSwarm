import path from 'node:path';

import type { ServerConfig } from './types';

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBooleanFlag = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseCommaList = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
};

export const loadConfig = (): ServerConfig => {
  const environment = (process.env.NODE_ENV ?? 'development') as ServerConfig['environment'];

  return {
    host: process.env.DROIDSWARM_SOCKET_HOST ?? '127.0.0.1',
    port: toPositiveInt(process.env.DROIDSWARM_SOCKET_PORT, 8765),
    projectId: process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
    allowedProjectIds: parseCommaList(process.env.DROIDSWARM_PROJECT_IDS),
    projectName: process.env.DROIDSWARM_PROJECT_NAME ?? 'DroidSwarm',
    dbPath: process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'),
    debug: toBooleanFlag(process.env.DROIDSWARM_DEBUG, false),
    swarmId: process.env.DROIDSWARM_SWARM_ID,
    operatorToken: process.env.DROIDSWARM_OPERATOR_TOKEN,
    authTimeoutMs: toPositiveInt(process.env.DROIDSWARM_AUTH_TIMEOUT_MS, 5_000),
    heartbeatTimeoutMs: toPositiveInt(process.env.DROIDSWARM_HEARTBEAT_TIMEOUT_MS, 90_000),
    maxMessagesPerWindow: toPositiveInt(process.env.DROIDSWARM_MAX_MESSAGES_PER_WINDOW, 10),
    messageWindowMs: toPositiveInt(process.env.DROIDSWARM_MESSAGE_WINDOW_MS, 1_000),
    federationEnabled: toBooleanFlag(process.env.DROIDSWARM_ENABLE_FEDERATION, false),
    federationNodeId: process.env.DROIDSWARM_FEDERATION_NODE_ID
      ?? process.env.DROIDSWARM_SWARM_ID
      ?? process.env.DROIDSWARM_PROJECT_ID
      ?? 'droidswarm-local',
    federationBusUrl: process.env.DROIDSWARM_FEDERATION_BUS_URL,
    federationAdminUrl: process.env.DROIDSWARM_FEDERATION_ADMIN_URL,
    federationPollMs: toPositiveInt(process.env.DROIDSWARM_FEDERATION_POLL_MS, 2_000),
    federationSigningKeyId: process.env.DROIDSWARM_FEDERATION_SIGNING_KEY_ID,
    federationSigningPrivateKey: process.env.DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY,
    governanceEnabled: toBooleanFlag(process.env.DROIDSWARM_ENABLE_GOVERNANCE, true),
    environment,
  };
};
