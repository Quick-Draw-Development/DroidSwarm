import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { listRegisteredModels } from '@shared-projects';

import { chooseBestModel, refreshModelInventory, scanLocalModels } from './model-inventory';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('scans gguf models and persists them into the registry', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-models-'));
  const modelsDir = path.join(home, 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.writeFileSync(path.join(modelsDir, 'qwen2.5-coder-14b-16k-q4_k_m.gguf'), 'model');
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_MODELS_DIR = modelsDir;
  process.env.DROIDSWARM_LLAMA_MODELS_FILE = path.join(modelsDir, 'inventory.json');
  process.env.DROIDSWARM_FEDERATION_NODE_ID = 'node-a';

  const snapshot = refreshModelInventory();

  assert.equal(snapshot.models.length, 1);
  assert.equal(snapshot.models[0]?.backend, 'local-llama');
  assert.equal(snapshot.models[0]?.reasoningDepth, 'high');
  assert.equal(listRegisteredModels({ nodeId: 'node-a' }).length, 1);
});

test('includes apple and mlx runtime records when enabled', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-virtual-models-'));
  const modelsDir = path.join(home, 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_MODELS_DIR = modelsDir;
  process.env.DROIDSWARM_APPLE_INTELLIGENCE_ENABLED = 'true';
  process.env.DROIDSWARM_MLX_ENABLED = 'true';

  const models = scanLocalModels();

  assert.ok(models.some((entry) => entry.backend === 'apple-intelligence'));
  assert.ok(models.some((entry) => entry.backend === 'mlx'));
});

test('scores model choices according to reasoning and latency preferences', () => {
  const best = chooseBestModel([
    {
      nodeId: 'node-a',
      modelId: 'small-fast',
      displayName: 'qwen2.5-7b-q4',
      backend: 'local-llama',
      toolUse: true,
      reasoningDepth: 'low',
      speedTier: 'fast',
      enabled: true,
      tags: ['code'],
      metadata: {},
      source: 'local-scan',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contextLength: 8_192,
    },
    {
      nodeId: 'node-a',
      modelId: 'coder-heavy',
      displayName: 'qwen2.5-coder-32b-32k-q4',
      backend: 'local-llama',
      toolUse: true,
      reasoningDepth: 'high',
      speedTier: 'heavy',
      enabled: true,
      tags: ['code', 'review'],
      metadata: {},
      source: 'local-scan',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contextLength: 32_768,
    },
  ], {
    reasoningDepth: 'high',
    minContextLength: 16_000,
    toolUse: true,
    role: 'reviewer',
  });

  assert.equal(best?.modelId, 'coder-heavy');
});
