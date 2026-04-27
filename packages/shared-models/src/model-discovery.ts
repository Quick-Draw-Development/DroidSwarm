import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { runConsensusRound } from '@shared-governance';
import {
  getRegisteredModel,
  listRegisteredModels as listRegisteredModelsFromRegistry,
  upsertRegisteredModel,
  type RegisteredModelRecord,
  type UpsertRegisteredModelInput,
} from '@shared-projects';
import { appendAuditEvent } from '@shared-tracing';

import { loadModelDiscoveryConfig, saveModelDiscoveryConfig, type ModelDiscoveryConfig } from './discovery-config';
import { getModelLifecycleStatus, listDiscoveredModels, resolveLocalNodeId, resolveModelsRoot } from './model-inventory';

export interface DiscoveredModelCandidate {
  modelId: string;
  displayName: string;
  backend: 'local-llama';
  author?: string;
  quantization?: string;
  contextLength?: number;
  sizeBytes?: number;
  tags: string[];
  lastModifiedAt?: string;
  homepageUrl?: string;
  downloadUrl?: string;
  readmeUrl?: string;
  checksum?: string;
  source: 'huggingface-discovery' | 'local-ai-zone-discovery';
  metadata: Record<string, unknown>;
}

export interface DiscoveryCycleResult {
  triggeredBy: string;
  discovered: RegisteredModelRecord[];
  downloaded: RegisteredModelRecord[];
  skipped: string[];
  config: ModelDiscoveryConfig;
  completedAt: string;
}

export interface DiscoverModelsOptions {
  projectId?: string;
  force?: boolean;
  fetchFn?: typeof fetch;
  triggeredBy?: string;
}

const quantizationPattern = /(Q\d(?:_[A-Z0-9]+)+)/i;
const contextPattern = /(?:^|[-_ ])(\d{1,3})k(?:[-_ ]|$)/i;

const inferContextLength = (input: string): number | undefined => {
  const match = input.match(contextPattern);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1_024 : undefined;
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

const inferToolUse = (input: string, tags: string[]): boolean => {
  const normalized = `${input} ${tags.join(' ')}`.toLowerCase();
  return normalized.includes('tool') || normalized.includes('code') || normalized.includes('coder') || normalized.includes('function');
};

const normalizeRemoteModelId = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const asRecord = (input: unknown): Record<string, unknown> | undefined =>
  input != null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : undefined;

const shouldAcceptCandidate = (candidate: DiscoveredModelCandidate, config: ModelDiscoveryConfig): boolean => {
  if (candidate.author && config.trustedAuthors.length > 0 && !config.trustedAuthors.includes(candidate.author)) {
    return false;
  }
  if (candidate.author && config.blockedAuthors.includes(candidate.author)) {
    return false;
  }
  if (config.minSizeBytes && (candidate.sizeBytes ?? 0) > 0 && (candidate.sizeBytes ?? 0) < config.minSizeBytes) {
    return false;
  }
  if (config.allowedQuantizations.length > 0 && candidate.quantization && !config.allowedQuantizations.includes(candidate.quantization)) {
    return false;
  }
  if (config.lastCheckedAt && candidate.lastModifiedAt && candidate.lastModifiedAt <= config.lastCheckedAt) {
    return false;
  }
  return true;
};

const toDiscoveredRecord = (
  nodeId: string,
  candidate: DiscoveredModelCandidate,
): UpsertRegisteredModelInput => {
  const signature = `${candidate.displayName} ${candidate.homepageUrl ?? ''} ${candidate.tags.join(' ')}`;
  return {
    nodeId,
    modelId: normalizeRemoteModelId(candidate.modelId),
    displayName: candidate.displayName,
    backend: 'local-llama',
    quantization: candidate.quantization ?? candidate.displayName.match(quantizationPattern)?.[1]?.toUpperCase(),
    contextLength: candidate.contextLength ?? inferContextLength(signature),
    sizeBytes: candidate.sizeBytes,
    toolUse: inferToolUse(signature, candidate.tags),
    reasoningDepth: inferReasoningDepth(signature),
    speedTier: inferSpeedTier(signature, candidate.sizeBytes),
    enabled: false,
    tags: candidate.tags,
    metadata: {
      ...candidate.metadata,
      lifecycleStatus: 'discovered',
      author: candidate.author,
      homepageUrl: candidate.homepageUrl,
      downloadUrl: candidate.downloadUrl,
      readmeUrl: candidate.readmeUrl,
      checksum: candidate.checksum,
      lastModifiedAt: candidate.lastModifiedAt,
      discoveredAt: new Date().toISOString(),
      filename: typeof candidate.metadata.filename === 'string' ? candidate.metadata.filename : `${candidate.displayName}.gguf`,
    },
    source: candidate.source,
  };
};

const fetchJson = async <T>(url: string, fetchFn: typeof fetch): Promise<T> => {
  const response = await fetchFn(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'DroidSwarm-ModelDiscovery/0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`Model discovery request failed: ${response.status} ${response.statusText}`);
  }
  return await response.json() as T;
};

const parseHuggingFaceModels = (payload: unknown): DiscoveredModelCandidate[] => {
  if (!Array.isArray(payload)) {
    return [];
  }
  const discovered: DiscoveredModelCandidate[] = [];
  for (const item of payload) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const repoId = typeof record.id === 'string' ? record.id : undefined;
    if (!repoId) {
      continue;
    }
    const author = typeof record.author === 'string' ? record.author : repoId.split('/')[0];
    const tags = Array.isArray(record.tags) ? record.tags.filter((entry): entry is string => typeof entry === 'string') : [];
    const homepageUrl = `https://huggingface.co/${repoId}`;
    const readmeUrl = `${homepageUrl}#readme`;
    const siblings = Array.isArray(record.siblings) ? record.siblings.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry)) : [];
    for (const sibling of siblings) {
      const filename = typeof sibling.rfilename === 'string'
        ? sibling.rfilename
        : typeof sibling.path === 'string'
          ? sibling.path
          : undefined;
      if (!filename || !filename.endsWith('.gguf')) {
        continue;
      }
      const basename = path.basename(filename, '.gguf');
      discovered.push({
        modelId: `${repoId}-${basename}`,
        displayName: basename,
        backend: 'local-llama',
        author,
        quantization: basename.match(quantizationPattern)?.[1]?.toUpperCase(),
        contextLength: inferContextLength(basename),
        sizeBytes: typeof sibling.size === 'number' ? sibling.size : undefined,
        tags,
        lastModifiedAt: typeof record.lastModified === 'string' ? record.lastModified : undefined,
        homepageUrl,
        downloadUrl: `https://huggingface.co/${repoId}/resolve/main/${filename}`,
        readmeUrl,
        checksum: typeof sibling.sha256 === 'string' ? sibling.sha256 : undefined,
        source: 'huggingface-discovery',
        metadata: {
          repositoryId: repoId,
          filename,
          likes: record.likes,
          downloads: record.downloads,
        },
      });
    }
  }
  return discovered;
};

const parseLocalAiZoneModels = (html: string): DiscoveredModelCandidate[] => {
  const discovered: DiscoveredModelCandidate[] = [];
  const anchorPattern = /href="([^"]+\.gguf)"/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1];
    const basename = path.basename(href, '.gguf');
    discovered.push({
      modelId: `local-ai-zone-${basename}`,
      displayName: basename,
      backend: 'local-llama',
      quantization: basename.match(quantizationPattern)?.[1]?.toUpperCase(),
      contextLength: inferContextLength(basename),
      tags: ['gguf', 'aggregator'],
      homepageUrl: 'https://local-ai-zone.github.io/',
      downloadUrl: href.startsWith('http') ? href : `https://local-ai-zone.github.io/${href.replace(/^\//, '')}`,
      source: 'local-ai-zone-discovery',
      metadata: {
        filename: `${basename}.gguf`,
      },
    });
  }
  return discovered;
};

export const fetchNewGGUFModels = async (
  config: ModelDiscoveryConfig,
  fetchFn: typeof fetch = fetch,
): Promise<DiscoveredModelCandidate[]> => {
  const discovered: DiscoveredModelCandidate[] = [];
  for (const source of config.sources.filter((entry) => entry.enabled)) {
    if (source.type === 'huggingface') {
      const payload = await fetchJson<unknown>(source.endpoint, fetchFn);
      discovered.push(...parseHuggingFaceModels(payload));
      continue;
    }
    if (source.type === 'local-ai-zone') {
      const response = await fetchFn(source.endpoint, {
        headers: {
          accept: 'text/html',
          'user-agent': 'DroidSwarm-ModelDiscovery/0.1',
        },
      });
      if (response.ok) {
        discovered.push(...parseLocalAiZoneModels(await response.text()));
      }
    }
  }
  const byId = new Map<string, DiscoveredModelCandidate>();
  for (const candidate of discovered) {
    byId.set(candidate.modelId, candidate);
  }
  return [...byId.values()]
    .filter((candidate) => shouldAcceptCandidate(candidate, config))
    .slice(0, config.maxResultsPerSource);
};

const modelNeedsQuarantine = (record: UpsertRegisteredModelInput, config: ModelDiscoveryConfig): string | undefined => {
  const metadata = record.metadata ?? {};
  const readmeUrl = typeof metadata.readmeUrl === 'string' ? metadata.readmeUrl : undefined;
  if (!config.allowMissingReadme && !readmeUrl) {
    return 'missing-readme';
  }
  if ((record.tags ?? []).some((tag) => tag.toLowerCase().includes('nsfw'))) {
    return 'suspicious-tags';
  }
  return undefined;
};

export const discoverModels = async (options: DiscoverModelsOptions = {}): Promise<DiscoveryCycleResult> => {
  const config = loadModelDiscoveryConfig(options.projectId);
  if (!config.enabled && options.force !== true) {
    return {
      triggeredBy: options.triggeredBy ?? 'manual',
      discovered: [],
      downloaded: [],
      skipped: ['discovery-disabled'],
      config,
      completedAt: new Date().toISOString(),
    };
  }
  const nodeId = resolveLocalNodeId();
  const candidates = await fetchNewGGUFModels(config, options.fetchFn);
  const discovered: RegisteredModelRecord[] = [];
  const downloaded: RegisteredModelRecord[] = [];
  const skipped: string[] = [];
  for (const candidate of candidates) {
    const existing = getRegisteredModel(nodeId, normalizeRemoteModelId(candidate.modelId));
    if (existing && getModelLifecycleStatus(existing) !== 'quarantined') {
      skipped.push(candidate.modelId);
      continue;
    }
    const recordInput = toDiscoveredRecord(nodeId, candidate);
    const quarantineReason = modelNeedsQuarantine(recordInput, config);
    if (quarantineReason) {
      recordInput.metadata = {
        ...recordInput.metadata,
        lifecycleStatus: 'quarantined',
        quarantineReason,
      };
    }
    const stored = upsertRegisteredModel(recordInput);
    appendAuditEvent('MODEL_DISCOVERED', {
      nodeId,
      modelId: stored.modelId,
      displayName: stored.displayName,
      source: stored.source,
      lifecycleStatus: getModelLifecycleStatus(stored),
    });
    discovered.push(stored);
    if (
      config.autoDownloadSmallModels
      && !quarantineReason
      && (stored.sizeBytes ?? Number.MAX_SAFE_INTEGER) <= config.maxAutoDownloadSizeBytes
      && typeof stored.metadata.downloadUrl === 'string'
    ) {
      const downloadedModel = await downloadDiscoveredModel(stored.modelId, {
        config,
        fetchFn: options.fetchFn,
        triggeredBy: 'auto-discovery',
        autoApprove: true,
      });
      downloaded.push(downloadedModel);
    }
  }
  saveModelDiscoveryConfig({
    lastCheckedAt: new Date().toISOString(),
  }, options.projectId ? { projectId: options.projectId } : undefined);
  appendAuditEvent('MODEL_DISCOVERY_CYCLE', {
    nodeId,
    triggeredBy: options.triggeredBy ?? 'manual',
    discoveredCount: discovered.length,
    downloadedCount: downloaded.length,
    skippedCount: skipped.length,
  });
  return {
    triggeredBy: options.triggeredBy ?? 'manual',
    discovered,
    downloaded,
    skipped,
    config: loadModelDiscoveryConfig(options.projectId),
    completedAt: new Date().toISOString(),
  };
};

const computeSha256 = (filePath: string): string =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const validateGgufFile = (filePath: string): boolean => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    return buffer.toString('utf8') === 'GGUF';
  } finally {
    fs.closeSync(fd);
  }
};

export const downloadDiscoveredModel = async (
  modelId: string,
  options?: {
    config?: ModelDiscoveryConfig;
    fetchFn?: typeof fetch;
    triggeredBy?: string;
    autoApprove?: boolean;
  },
): Promise<RegisteredModelRecord> => {
  const nodeId = resolveLocalNodeId();
  const record = listRegisteredModelsFromRegistry({ nodeId })
    .find((entry) => entry.modelId === modelId);
  if (!record) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  const downloadUrl = typeof record.metadata.downloadUrl === 'string' ? record.metadata.downloadUrl : undefined;
  if (!downloadUrl) {
    throw new Error(`Model ${modelId} has no download URL.`);
  }
  const config = options?.config ?? loadModelDiscoveryConfig();
  const isCritical = record.reasoningDepth === 'high' && (record.sizeBytes ?? 0) >= config.criticalSizeBytes;
  if (options?.autoApprove && isCritical) {
    const consensus = runConsensusRound({
      proposalType: 'human-override',
      title: `Auto-onboard critical model ${record.displayName}`,
      summary: `Automatic onboarding requested for ${record.displayName}.`,
      glyph: 'EVT-MODEL-SELECTED',
      context: {
        eventType: 'model.discovery',
        actorRole: 'orchestrator',
        swarmRole: 'master',
        projectId: process.env.DROIDSWARM_PROJECT_ID,
        auditLoggingEnabled: true,
        dashboardEnabled: false,
      },
    });
    if (!consensus.approved) {
      throw new Error(`Consensus blocked auto-onboarding for ${record.displayName}.`);
    }
  }
  const targetRoot = resolveModelsRoot();
  fs.mkdirSync(targetRoot, { recursive: true });
  const filename = typeof record.metadata.filename === 'string' ? record.metadata.filename : `${record.displayName}.gguf`;
  const targetPath = path.resolve(targetRoot, filename);
  const fetchFn = options?.fetchFn ?? fetch;
  const response = await fetchFn(downloadUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed: ${response.status} ${response.statusText}`);
  }
  fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
  const checksum = typeof record.metadata.checksum === 'string' ? record.metadata.checksum : undefined;
  if (config.checksumRequired && !checksum) {
    throw new Error(`Missing checksum for ${record.displayName}.`);
  }
  if (checksum && computeSha256(targetPath) !== checksum) {
    upsertRegisteredModel({
      ...record,
      metadata: {
        ...record.metadata,
        lifecycleStatus: 'quarantined',
        quarantineReason: 'checksum-mismatch',
      },
      enabled: false,
    });
    throw new Error(`Checksum mismatch for ${record.displayName}.`);
  }
  if (!validateGgufFile(targetPath)) {
    upsertRegisteredModel({
      ...record,
      metadata: {
        ...record.metadata,
        lifecycleStatus: 'validation-failed',
      },
      enabled: false,
    });
    throw new Error(`GGUF validation failed for ${record.displayName}.`);
  }
  const stats = fs.statSync(targetPath);
  const stored = upsertRegisteredModel({
    nodeId: record.nodeId,
    modelId: record.modelId,
    displayName: record.displayName,
    backend: record.backend,
    path: targetPath,
    quantization: record.quantization,
    contextLength: record.contextLength,
    sizeBytes: stats.size,
    toolUse: record.toolUse,
    reasoningDepth: record.reasoningDepth,
    speedTier: record.speedTier,
    enabled: true,
    tags: record.tags,
    metadata: {
      ...record.metadata,
      lifecycleStatus: 'ready',
      downloadedAt: new Date().toISOString(),
    },
    source: 'downloaded',
  });
  appendAuditEvent('MODEL_DOWNLOADED', {
    nodeId,
    modelId: stored.modelId,
    displayName: stored.displayName,
    triggeredBy: options?.triggeredBy ?? 'manual',
  });
  return stored;
};

export const startModelDiscoveryLoop = (input?: {
  projectId?: string;
  fetchFn?: typeof fetch;
}): (() => void) => {
  const config = loadModelDiscoveryConfig(input?.projectId);
  if (!config.enabled) {
    return () => undefined;
  }
  let closed = false;
  const trigger = () => {
    void discoverModels({
      projectId: input?.projectId,
      fetchFn: input?.fetchFn,
      triggeredBy: 'startup-loop',
    }).catch(() => undefined);
  };
  trigger();
  const timer = setInterval(trigger, config.pollingIntervalMs);
  return () => {
    if (!closed) {
      clearInterval(timer);
      closed = true;
    }
  };
};
