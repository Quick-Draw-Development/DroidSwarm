import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getRalphWorkerStatus, pauseRalphWorker, runRalphLoop, startRalphWorker } from './ralph-loop';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('starts and completes a Ralph loop using shared persistence', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-ralph-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_ENABLE_RALPH = 'true';
  const started = startRalphWorker({
    projectId: 'demo',
    goal: 'Iteratively polish the implementation and emit <RALPH_DONE> when stable.',
    metadata: {
      autoCompleteAfter: 2,
      expectedIterations: 12,
      longHorizon: true,
    },
    spawnDetached: false,
  });

  const completed = await runRalphLoop(started.sessionId);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.iterationCount, 2);
  assert.match(completed.lastSummary ?? '', /<RALPH_DONE>/);
});

test('pauses a Ralph session without losing persisted state', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-ralph-pause-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_ENABLE_RALPH = 'true';
  const started = startRalphWorker({
    projectId: 'demo',
    goal: 'Keep refining the plan.',
    spawnDetached: false,
  });

  const paused = pauseRalphWorker(started.sessionId);
  assert.equal(paused.status, 'paused');
  assert.equal(getRalphWorkerStatus(started.sessionId)?.status, 'paused');
});
