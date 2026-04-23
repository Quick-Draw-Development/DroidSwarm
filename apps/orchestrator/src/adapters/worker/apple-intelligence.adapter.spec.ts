import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkerRequest } from '@shared-workers';

import { AppleIntelligenceWorkerAdapter } from './apple-intelligence.adapter';

const request: WorkerRequest = {
  runId: 'run-apple',
  taskId: 'task-apple',
  attemptId: 'attempt-1',
  role: 'coder-ios',
  instructions: 'Implement the SwiftUI settings screen.',
  scope: {
    projectId: 'proj-1',
    repoId: 'repo-1',
    rootPath: '/tmp/project',
    branch: 'main',
  },
  engine: 'apple-intelligence',
};

test('returns a structured unavailable result when Apple Intelligence is disabled', async () => {
  const adapter = new AppleIntelligenceWorkerAdapter({
    model: 'apple-intelligence/local',
    sdkEnabled: false,
  });

  const result = await adapter.run(request);

  assert.equal(result.success, false);
  assert.equal(result.engine, 'apple-intelligence');
  assert.equal(result.metadata?.reasonCode, 'apple_intelligence_unavailable');
});

test('executes the Apple Intelligence path when a client factory is provided', async () => {
  const adapter = new AppleIntelligenceWorkerAdapter({
    model: 'apple-intelligence/local',
    clientFactory: () => ({
      async processTask() {
        return { data: 'Apple Intelligence completed the task.' };
      },
    }),
  });

  const result = await adapter.run(request);

  assert.equal(result.success, true);
  assert.equal(result.summary, 'Apple Intelligence completed the task.');
  assert.equal(result.model, 'apple-intelligence/local');
});
