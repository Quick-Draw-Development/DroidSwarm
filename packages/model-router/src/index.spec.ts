import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { chooseBackend, chooseBackendDecision, detectAppleSilicon, detectMlxRuntime } from './index';

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
});
