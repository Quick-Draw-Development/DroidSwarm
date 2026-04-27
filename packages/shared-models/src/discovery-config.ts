import { getModelDiscoverySettings, upsertModelDiscoverySettings } from '@shared-projects';

export interface ModelDiscoverySourceConfig {
  id: string;
  type: 'huggingface' | 'local-ai-zone';
  enabled: boolean;
  endpoint: string;
}

export interface ModelDiscoveryConfig {
  enabled: boolean;
  quietMode: boolean;
  pollingIntervalMs: number;
  maxResultsPerSource: number;
  trustedAuthors: string[];
  blockedAuthors: string[];
  allowedQuantizations: string[];
  minSizeBytes?: number;
  lastCheckedAt?: string;
  autoDownloadSmallModels: boolean;
  maxAutoDownloadSizeBytes: number;
  checksumRequired: boolean;
  allowMissingReadme: boolean;
  criticalSizeBytes: number;
  sources: ModelDiscoverySourceConfig[];
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const defaultModelDiscoveryConfig = (): ModelDiscoveryConfig => ({
  enabled: parseBoolean(process.env.DROIDSWARM_MODEL_DISCOVERY_ENABLED, false),
  quietMode: parseBoolean(process.env.DROIDSWARM_MODEL_DISCOVERY_QUIET, false),
  pollingIntervalMs: parseNumber(process.env.DROIDSWARM_MODEL_DISCOVERY_INTERVAL_MS, 6 * 60 * 60 * 1000),
  maxResultsPerSource: parseNumber(process.env.DROIDSWARM_MODEL_DISCOVERY_MAX_RESULTS, 100),
  trustedAuthors: parseList(process.env.DROIDSWARM_MODEL_DISCOVERY_TRUSTED_AUTHORS),
  blockedAuthors: parseList(process.env.DROIDSWARM_MODEL_DISCOVERY_BLOCKED_AUTHORS),
  allowedQuantizations: parseList(process.env.DROIDSWARM_MODEL_DISCOVERY_ALLOWED_QUANTIZATIONS),
  minSizeBytes: (() => {
    const value = process.env.DROIDSWARM_MODEL_DISCOVERY_MIN_SIZE_BYTES;
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  })(),
  lastCheckedAt: undefined,
  autoDownloadSmallModels: parseBoolean(process.env.DROIDSWARM_MODEL_DISCOVERY_AUTO_DOWNLOAD_SMALL, false),
  maxAutoDownloadSizeBytes: parseNumber(process.env.DROIDSWARM_MODEL_DISCOVERY_AUTO_DOWNLOAD_MAX_BYTES, 10 * 1024 * 1024 * 1024),
  checksumRequired: parseBoolean(process.env.DROIDSWARM_MODEL_DISCOVERY_CHECKSUM_REQUIRED, false),
  allowMissingReadme: parseBoolean(process.env.DROIDSWARM_MODEL_DISCOVERY_ALLOW_MISSING_README, false),
  criticalSizeBytes: parseNumber(process.env.DROIDSWARM_MODEL_DISCOVERY_CRITICAL_SIZE_BYTES, 20 * 1024 * 1024 * 1024),
  sources: [
    {
      id: 'huggingface',
      type: 'huggingface',
      enabled: true,
      endpoint: process.env.DROIDSWARM_MODEL_DISCOVERY_HF_ENDPOINT ?? 'https://huggingface.co/api/models?library=gguf&sort=last_modified&limit=100&full=true',
    },
    {
      id: 'local-ai-zone',
      type: 'local-ai-zone',
      enabled: parseBoolean(process.env.DROIDSWARM_MODEL_DISCOVERY_ENABLE_LOCAL_AI_ZONE, false),
      endpoint: process.env.DROIDSWARM_MODEL_DISCOVERY_LOCAL_AI_ZONE_ENDPOINT ?? 'https://local-ai-zone.github.io/',
    },
  ],
});

export const loadModelDiscoveryConfig = (projectId?: string): ModelDiscoveryConfig => {
  const defaults = defaultModelDiscoveryConfig();
  const globalSettings = getModelDiscoverySettings('global')?.settings ?? {};
  const projectSettings = projectId ? getModelDiscoverySettings(`project:${projectId}`)?.settings ?? {} : {};
  const merged = {
    ...defaults,
    ...globalSettings,
    ...projectSettings,
  } as ModelDiscoveryConfig;
  return {
    ...defaults,
    ...merged,
    sources: Array.isArray(merged.sources) && merged.sources.length > 0 ? merged.sources : defaults.sources,
    trustedAuthors: Array.isArray(merged.trustedAuthors) ? merged.trustedAuthors.filter((entry): entry is string => typeof entry === 'string') : defaults.trustedAuthors,
    blockedAuthors: Array.isArray(merged.blockedAuthors) ? merged.blockedAuthors.filter((entry): entry is string => typeof entry === 'string') : defaults.blockedAuthors,
    allowedQuantizations: Array.isArray(merged.allowedQuantizations) ? merged.allowedQuantizations.filter((entry): entry is string => typeof entry === 'string') : defaults.allowedQuantizations,
  };
};

export const saveModelDiscoveryConfig = (
  settings: Partial<ModelDiscoveryConfig>,
  input?: { projectId?: string },
): ModelDiscoveryConfig => {
  const scopeKey = input?.projectId ? `project:${input.projectId}` : 'global';
  const current = loadModelDiscoveryConfig(input?.projectId);
  const merged = {
    ...current,
    ...settings,
  };
  upsertModelDiscoverySettings(scopeKey, merged as Record<string, unknown>, input);
  return loadModelDiscoveryConfig(input?.projectId);
};
