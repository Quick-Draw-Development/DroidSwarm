import fs from 'node:fs';
import path from 'node:path';

import {
  listRegisteredModels as listRegisteredModelsFromRegistry,
  resolveDroidSwarmHome,
  upsertRegisteredModel,
  type RegisteredModelRecord,
  type UpsertRegisteredModelInput,
} from '@shared-projects';

export interface InventoryRefreshOptions {
  nodeId?: string;
  modelsRoot?: string;
  cacheFile?: string;
  includeVirtualBackends?: boolean;
  persist?: boolean;
  source?: UpsertRegisteredModelInput['source'];
}

export interface ModelPreferenceProfile {
  backend?: RegisteredModelRecord['backend'];
  reasoningDepth?: RegisteredModelRecord['reasoningDepth'];
  minContextLength?: number;
  toolUse?: boolean;
  speedPriority?: 'latency' | 'balanced' | 'throughput';
  role?: string;
  useCase?: string;
  tags?: string[];
}

export interface ModelInventorySnapshot {
  nodeId: string;
  models: RegisteredModelRecord[];
  cacheFile: string;
  generatedAt: string;
}

const quantizationPattern = /(Q\d(?:_[A-Z0-9]+)+)/i;
const contextPattern = /(?:^|[-_ ])(\d{1,3})k(?:[-_ ]|$)/i;

const ensureDirectory = (target: string): void => {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
};

const walkFiles = (root: string): string[] => {
  if (!fs.existsSync(root)) {
    return [];
  }
  const stack = [root];
  const results: string[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(resolved);
        continue;
      }
      results.push(resolved);
    }
  }
  return results;
};

const parseBootstrapInventory = (cacheFile: string): Array<{
  id: string;
  displayName: string;
  path?: string;
  tags: string[];
  metadata: Record<string, unknown>;
}> => {
  if (!fs.existsSync(cacheFile)) {
    return [];
  }
  try {
    const payload = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as {
      models?: Array<Record<string, unknown>>;
    };
    return (Array.isArray(payload.models) ? payload.models : [])
      .filter((entry): entry is Record<string, unknown> => entry != null && typeof entry === 'object')
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : typeof entry.name === 'string' ? entry.name : 'unknown-model',
        displayName: typeof entry.name === 'string' ? entry.name : typeof entry.id === 'string' ? entry.id : 'unknown-model',
        path: typeof entry.path === 'string' ? entry.path : undefined,
        tags: typeof entry.tags === 'string'
          ? entry.tags.split(',').map((part) => part.trim()).filter(Boolean)
          : [],
        metadata: entry,
      }));
  } catch {
    return [];
  }
};

const inferReasoningDepth = (input: string): RegisteredModelRecord['reasoningDepth'] => {
  const normalized = input.toLowerCase();
  if (normalized.includes('coder') || normalized.includes('70b') || normalized.includes('72b') || normalized.includes('32b')) {
    return 'high';
  }
  if (normalized.includes('7b') || normalized.includes('8b') || normalized.includes('mini') || normalized.includes('small')) {
    return 'low';
  }
  return 'medium';
};

const inferSpeedTier = (input: string, sizeBytes?: number): RegisteredModelRecord['speedTier'] => {
  const normalized = input.toLowerCase();
  if (normalized.includes('7b') || normalized.includes('8b') || normalized.includes('mini') || normalized.includes('q4')) {
    return 'fast';
  }
  if ((sizeBytes ?? 0) >= 20_000_000_000 || normalized.includes('70b') || normalized.includes('72b') || normalized.includes('32b')) {
    return 'heavy';
  }
  return 'balanced';
};

const inferContextLength = (input: string, metadata?: Record<string, unknown>): number | undefined => {
  const explicit = metadata?.context_length;
  if (typeof explicit === 'number' && explicit > 0) {
    return explicit;
  }
  const filenameMatch = input.match(contextPattern);
  if (filenameMatch) {
    const parsed = Number.parseInt(filenameMatch[1] ?? '', 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1_024;
    }
  }
  return undefined;
};

const inferToolUse = (input: string, tags: string[]): boolean => {
  const normalized = `${input} ${tags.join(' ')}`.toLowerCase();
  return normalized.includes('tool') || normalized.includes('code') || normalized.includes('coder') || normalized.includes('function');
};

const normalizeModelId = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const toModelRecord = (
  nodeId: string,
  input: {
    id: string;
    displayName: string;
    backend: RegisteredModelRecord['backend'];
    path?: string;
    sizeBytes?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
    source: UpsertRegisteredModelInput['source'];
  },
): UpsertRegisteredModelInput => {
  const signature = `${input.displayName} ${input.path ?? ''} ${(input.tags ?? []).join(' ')}`;
  const quantization = input.metadata?.quantization && typeof input.metadata.quantization === 'string'
    ? input.metadata.quantization
    : (signature.match(quantizationPattern)?.[1]?.toUpperCase());
  return {
    nodeId,
    modelId: normalizeModelId(input.id),
    displayName: input.displayName,
    backend: input.backend,
    path: input.path,
    quantization,
    contextLength: inferContextLength(signature, input.metadata),
    sizeBytes: input.sizeBytes,
    toolUse: inferToolUse(signature, input.tags ?? []),
    reasoningDepth: inferReasoningDepth(signature),
    speedTier: inferSpeedTier(signature, input.sizeBytes),
    enabled: true,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    source: input.source,
  };
};

export const resolveModelsRoot = (): string =>
  process.env.DROIDSWARM_MODELS_DIR ?? path.resolve(resolveDroidSwarmHome(), 'models');

export const resolveModelInventoryCacheFile = (): string =>
  process.env.DROIDSWARM_LLAMA_MODELS_FILE ?? path.resolve(resolveModelsRoot(), 'inventory.json');

export const resolveLocalNodeId = (): string =>
  process.env.DROIDSWARM_FEDERATION_NODE_ID
  ?? process.env.DROIDSWARM_NODE_ID
  ?? 'local-node';

export const scanLocalModels = (options: InventoryRefreshOptions = {}): UpsertRegisteredModelInput[] => {
  const nodeId = options.nodeId ?? resolveLocalNodeId();
  const modelsRoot = options.modelsRoot ?? resolveModelsRoot();
  const cacheFile = options.cacheFile ?? resolveModelInventoryCacheFile();
  const files = walkFiles(modelsRoot)
    .filter((entry) => entry.endsWith('.gguf'))
    .filter((entry) => !entry.endsWith('inventory.json'));

  const localModels = files.map((filePath) => {
    const stats = fs.statSync(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    return toModelRecord(nodeId, {
      id: basename,
      displayName: basename,
      backend: 'local-llama',
      path: filePath,
      sizeBytes: stats.size,
      tags: ['gguf', 'llama.cpp'],
      metadata: { filename: path.basename(filePath) },
      source: options.source ?? 'local-scan',
    });
  });

  const bootstrapModels = parseBootstrapInventory(cacheFile)
    .filter((entry) => !entry.path || fs.existsSync(entry.path))
    .map((entry) => toModelRecord(nodeId, {
      id: entry.id,
      displayName: entry.displayName,
      backend: 'local-llama',
      path: entry.path,
      tags: entry.tags,
      metadata: entry.metadata,
      source: 'bootstrap-inventory',
    }));

  const byKey = new Map<string, UpsertRegisteredModelInput>();
  for (const record of [...bootstrapModels, ...localModels]) {
    byKey.set(`${record.backend}:${record.modelId}`, record);
  }

  if (options.includeVirtualBackends !== false) {
    const appleEnabled = ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_APPLE_INTELLIGENCE_ENABLED ?? '').toLowerCase());
    const mlxEnabled = ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_MLX_ENABLED ?? '').toLowerCase())
      || typeof process.env.DROIDSWARM_MLX_BASE_URL === 'string';
    if (appleEnabled) {
      byKey.set('apple-intelligence:apple-intelligence-local', {
        nodeId,
        modelId: 'apple-intelligence-local',
        displayName: process.env.DROIDSWARM_MODEL_APPLE ?? 'apple-intelligence/local',
        backend: 'apple-intelligence',
        toolUse: true,
        reasoningDepth: 'medium',
        speedTier: 'balanced',
        enabled: true,
        tags: ['apple', 'foundation-models'],
        metadata: { runtime: 'apple-intelligence' },
        source: options.source ?? 'local-scan',
      });
    }
    if (mlxEnabled) {
      byKey.set('mlx:mlx-local', {
        nodeId,
        modelId: 'mlx-local',
        displayName: process.env.DROIDSWARM_MODEL_MLX ?? 'mlx/local',
        backend: 'mlx',
        toolUse: true,
        reasoningDepth: 'medium',
        speedTier: 'balanced',
        enabled: true,
        tags: ['mlx', 'local'],
        metadata: { baseUrl: process.env.DROIDSWARM_MLX_BASE_URL },
        source: options.source ?? 'local-scan',
      });
    }
  }

  return [...byKey.values()];
};

const serializeCache = (snapshot: ModelInventorySnapshot): string => JSON.stringify({
  nodeId: snapshot.nodeId,
  generatedAt: snapshot.generatedAt,
  models: snapshot.models.map((model) => ({
    id: model.modelId,
    name: model.displayName,
    backend: model.backend,
    path: model.path,
    tags: model.tags.join(','),
    quantization: model.quantization,
    context_length: model.contextLength,
    size_bytes: model.sizeBytes,
    reasoning_depth: model.reasoningDepth,
    speed_tier: model.speedTier,
    tool_use: model.toolUse,
    metadata: model.metadata,
  })),
}, null, 2);

export const refreshModelInventory = (options: InventoryRefreshOptions = {}): ModelInventorySnapshot => {
  const nodeId = options.nodeId ?? resolveLocalNodeId();
  const cacheFile = options.cacheFile ?? resolveModelInventoryCacheFile();
  const persist = options.persist !== false;
  const scanned = scanLocalModels(options).map((entry) => (
    persist ? upsertRegisteredModel(entry) : ({
      ...entry,
      toolUse: entry.toolUse ?? false,
      reasoningDepth: entry.reasoningDepth ?? 'medium',
      speedTier: entry.speedTier ?? 'balanced',
      enabled: entry.enabled !== false,
      tags: entry.tags ?? [],
      metadata: entry.metadata ?? {},
      source: entry.source ?? 'local-scan',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as RegisteredModelRecord)
  ));
  const generatedAt = new Date().toISOString();
  const snapshot: ModelInventorySnapshot = {
    nodeId,
    models: scanned,
    cacheFile,
    generatedAt,
  };
  ensureDirectory(path.dirname(cacheFile));
  fs.writeFileSync(cacheFile, serializeCache(snapshot));
  return snapshot;
};

export const listRegisteredModels = (input?: {
  nodeId?: string;
  backend?: RegisteredModelRecord['backend'];
  enabledOnly?: boolean;
}): RegisteredModelRecord[] => listRegisteredModelsFromRegistry(input);

export const chooseBestModel = (
  inventory: RegisteredModelRecord[],
  preferences: ModelPreferenceProfile = {},
): RegisteredModelRecord | undefined => {
  const eligible = inventory.filter((model) => {
    if (!model.enabled) {
      return false;
    }
    if (preferences.backend && model.backend !== preferences.backend) {
      return false;
    }
    if (preferences.toolUse === true && !model.toolUse) {
      return false;
    }
    if ((preferences.minContextLength ?? 0) > (model.contextLength ?? 0) && model.backend === 'local-llama') {
      return false;
    }
    return true;
  });
  const reasoningScore = { low: 1, medium: 2, high: 3 };
  const speedScore = { fast: 3, balanced: 2, heavy: 1 };
  return eligible
    .map((model) => {
      let score = 0;
      score += reasoningScore[model.reasoningDepth] * 5;
      score += speedScore[model.speedTier] * (preferences.speedPriority === 'latency' ? 4 : preferences.speedPriority === 'throughput' ? 2 : 3);
      score += Math.min((model.contextLength ?? 0) / 4_096, 6);
      if (preferences.reasoningDepth && model.reasoningDepth === preferences.reasoningDepth) {
        score += 5;
      }
      if (preferences.tags?.some((tag) => model.tags.includes(tag))) {
        score += 3;
      }
      if (preferences.role && `${model.displayName} ${model.tags.join(' ')}`.toLowerCase().includes(preferences.role.toLowerCase())) {
        score += 2;
      }
      if (preferences.useCase && `${model.displayName} ${model.tags.join(' ')}`.toLowerCase().includes(preferences.useCase.toLowerCase())) {
        score += 2;
      }
      return { model, score };
    })
    .sort((left, right) => right.score - left.score || right.model.updatedAt.localeCompare(left.model.updatedAt))[0]?.model;
};
