import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { chooseBackend, detectAppleSilicon } from './index';

describe('model-router', () => {
  it('detects Apple silicon only on darwin arm64', () => {
    assert.equal(detectAppleSilicon('darwin', 'arm64'), true);
    assert.equal(detectAppleSilicon('linux', 'arm64'), false);
    assert.equal(detectAppleSilicon('darwin', 'x64'), false);
  });

  it('prefers Apple Intelligence when available and preferred', () => {
    assert.equal(chooseBackend({
      preferAppleIntelligence: true,
      appleRuntimeAvailable: true,
    }), 'apple-intelligence');
  });

  it('falls back to mlx for heavy contexts when Apple is unavailable', () => {
    assert.equal(chooseBackend({
      preferAppleIntelligence: true,
      appleRuntimeAvailable: false,
      mlxAvailable: true,
      contextLength: 20000,
    }), 'mlx');
  });

  it('falls back to local llama by default', () => {
    assert.equal(chooseBackend({
      preferAppleIntelligence: false,
      appleRuntimeAvailable: false,
    }), 'local-llama');
  });
});
