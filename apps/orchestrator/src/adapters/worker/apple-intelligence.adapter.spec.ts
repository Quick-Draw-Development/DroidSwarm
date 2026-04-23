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

test('executes structured Apple Intelligence responses with tool calls and memory', async () => {
  const adapter = new AppleIntelligenceWorkerAdapter({
    model: 'apple-intelligence/local',
    preferredByHost: true,
    availableTools: ['scan_repo', 'read_file'],
    clientFactory: () => ({
      async runStructuredTask() {
        return {
          data: {
            summary: 'Apple Intelligence completed the task.',
            success: true,
            factsAdded: ['SwiftUI settings screen uses grouped sections.'],
            decisionsAdded: ['Use Form for grouped iOS settings presentation.'],
            toolCalls: [
              {
                tool: 'scan_repo',
                summary: 'Scanned the iOS feature module.',
              },
            ],
            sessionMemory: {
              summary: 'Remembered the current SwiftUI architecture.',
              notes: ['Uses feature-based module boundaries.'],
            },
            spawnRequests: [
              {
                role: 'reviewer',
                reason: 'Validate UIKit compatibility.',
                instructions: 'Review the SwiftUI migration.',
              },
            ],
          },
        };
      },
    }),
  });

  const result = await adapter.run(request);

  assert.equal(result.success, true);
  assert.equal(result.summary, 'Apple Intelligence completed the task.');
  assert.equal(result.model, 'apple-intelligence/local');
  assert.equal(result.activity.toolCalls[0]?.tool, 'scan_repo');
  assert.equal(result.checkpointDelta.decisionsAdded[0], 'Use Form for grouped iOS settings presentation.');
  assert.equal(result.spawnRequests[0]?.role, 'reviewer');
  assert.equal((result.metadata?.sessionMemory as { summary?: string })?.summary, 'Remembered the current SwiftUI architecture.');
  assert.equal(result.metadata?.preferredByHost, true);
});

test('falls back to processTask when structured entrypoint is unavailable', async () => {
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
});
