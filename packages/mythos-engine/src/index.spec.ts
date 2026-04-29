import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { OpenMythosAdapter, bootstrapMythosRuntime, inspectMythosRuntime, readMythosRuntimeRegistry, setMythosLoopCount } from './index';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('inspects and persists the local mythos runtime in mock mode', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-mythos-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_ENABLE_MYTHOS = 'true';
  process.env.DROIDSWARM_MYTHOS_BRIDGE_MODE = 'mock';

  const status = await inspectMythosRuntime();

  assert.equal(status.available, true);
  assert.equal(readMythosRuntimeRegistry().length, 1);
});

test('runs recurrent reasoning and reports stability in mock mode', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-mythos-run-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_ENABLE_MYTHOS = 'true';
  process.env.DROIDSWARM_MYTHOS_BRIDGE_MODE = 'mock';

  const adapter = new OpenMythosAdapter();
  const result = await adapter.run({ prompt: 'Review this diff deeply.', loops: 6 });
  const spectralRadius = await adapter.computeSpectralRadius();
  const driftScore = await adapter.checkDrift('Review this diff deeply.');

  assert.equal(result.success, true);
  assert.equal(typeof spectralRadius, 'number');
  assert.equal(typeof driftScore, 'number');
});

test('updates loop counts and bootstraps the runtime registry', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-mythos-bootstrap-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_ENABLE_MYTHOS = 'true';
  process.env.DROIDSWARM_MYTHOS_BRIDGE_MODE = 'mock';

  const bootstrapped = await bootstrapMythosRuntime();
  const updated = await setMythosLoopCount(bootstrapped.engineId, 12);

  assert.equal(updated.loopCount, 12);
});
