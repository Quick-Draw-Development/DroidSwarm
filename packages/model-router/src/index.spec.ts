import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseBackend,
  chooseBackendDecision,
  detectAppleSilicon,
  detectMlxRuntime,
  selectModelForRole,
} from './index';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('model-router', () => {
  it('detects Apple silicon only on darwin arm64', () => {
    assert.equal(detectAppleSilicon('darwin', 'arm64'), true);
    assert.equal(detectAppleSilicon('linux', 'arm64'), false);
    assert.equal(detectAppleSilicon('darwin', 'x64'), false);
  });

  it('detects mlx runtime from explicit enablement or config', () => {
    assert.equal(detectMlxRuntime({ enabled: true }), true);
    assert.equal(detectMlxRuntime({ baseUrl: 'http://127.0.0.1:8080' }), true);
    assert.equal(detectMlxRuntime({ model: 'mlx-community/qwen' }), true);
    assert.equal(detectMlxRuntime({}), false);
  });

  it('prefers Apple Intelligence on Apple Silicon when the runtime is available', () => {
    const decision = chooseBackendDecision({
      platform: 'darwin',
      arch: 'arm64',
      appleRuntimeAvailable: true,
      mlxAvailable: true,
    });

    assert.equal(decision.backend, 'apple-intelligence');
    assert.match(decision.reason, /Foundation Models/);
  });

  it('falls back to MLX on Apple Silicon when Foundation Models are unavailable', () => {
    const decision = chooseBackendDecision({
      platform: 'darwin',
      arch: 'arm64',
      appleRuntimeAvailable: false,
      mlxAvailable: true,
      contextLength: 24_000,
    });

    assert.equal(decision.backend, 'mlx');
    assert.match(decision.reason, /falling back to MLX/i);
  });

  it('falls back to local llama when neither Apple nor MLX are ready', () => {
    assert.equal(chooseBackend({
      platform: 'darwin',
      arch: 'arm64',
      appleRuntimeAvailable: false,
      mlxAvailable: false,
    }), 'local-llama');
  });

  it('uses MLX for heavy local contexts even off Apple Silicon when available', () => {
    assert.equal(chooseBackend({
      platform: 'linux',
      arch: 'x64',
      appleRuntimeAvailable: false,
      mlxAvailable: true,
      taskType: 'embedding',
      contextLength: 18_000,
    }), 'mlx');
  });

  it('prefers OpenMythos for deep recurrent reasoning when available', () => {
    const decision = chooseBackendDecision({
      summary: 'Need deep recurrent long-horizon code-review reasoning',
      stage: 'review',
      appleRuntimeAvailable: true,
      mlxAvailable: true,
      mythosAvailable: true,
      contextLength: 24_000,
    });

    assert.equal(decision.backend, 'openmythos');
    assert.match(decision.reason, /OpenMythos/i);
  });

  it('marks long-horizon self-correcting work for the Ralph worker loop', () => {
    process.env.DROIDSWARM_ENABLE_RALPH = 'true';
    const decision = chooseBackendDecision({
      summary: 'Need iterative polishing and recovery after previous failures.',
      taskType: 'review-follow-up',
      iterationCountExpected: 12,
      selfCorrectionNeeded: true,
      longHorizon: true,
      polishingPhase: true,
      failureRecoveryMode: true,
    });

    assert.equal(decision.preferRalphWorker, true);
  });

  it('selects a strong review model from inventory when available', () => {
    const decision = selectModelForRole({
      role: 'code-review-agent',
      inventory: [
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
          modelId: 'review-heavy',
          displayName: 'qwen2.5-coder-32b-32k-q4',
          backend: 'local-llama',
          toolUse: true,
          reasoningDepth: 'high',
          speedTier: 'heavy',
          enabled: true,
          tags: ['review', 'code'],
          metadata: {},
          source: 'local-scan',
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          contextLength: 32_768,
        },
      ],
      appleRuntimeAvailable: false,
      mlxAvailable: false,
    });

    assert.equal(decision.model?.modelId, 'review-heavy');
    assert.equal(decision.backend, 'local-llama');
  });
});
