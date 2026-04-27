import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLongTermMemory, listLongTermMemories, pruneLongTermMemories } from './memory-store';
import { retrieveRelevantMemories } from './memory-retrieval';
import { recordProceduralMemory } from './procedural-memory';
import { runReflectionCycle } from './reflection-engine';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('stores and retrieves long-term memories', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-memory-'));
  process.env.DROIDSWARM_HOME = home;
  createLongTermMemory({
    projectId: 'demo',
    memoryType: 'semantic',
    droidspeakSummary: 'memory:pinned errors',
    englishTranslation: 'We handle errors by returning typed results.',
    embedding: [1, 0, 0],
  });
  assert.equal(listLongTermMemories({ projectId: 'demo' }).length, 1);
});

test('retrieves relevant memory by similarity', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-memory-search-'));
  process.env.DROIDSWARM_HOME = home;
  createLongTermMemory({
    projectId: 'demo',
    memoryType: 'user-preference',
    droidspeakSummary: 'memory:pinned concise',
    englishTranslation: 'User prefers concise error handling explanations.',
    embedding: [1, 0, 0, 0],
  });
  const results = retrieveRelevantMemories({
    projectId: 'demo',
    query: 'how should we explain error handling',
  });
  assert.equal(results.length > 0, true);
});

test('records procedural memory and reflection nudges', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-memory-procedural-'));
  process.env.DROIDSWARM_HOME = home;
  recordProceduralMemory({
    projectId: 'demo',
    outcome: 'failure',
    droidspeakSummary: 'blocked verification',
    englishTranslation: 'Verification kept failing on review automation.',
    trajectory: { role: 'reviewer' },
  });
  const reflection = runReflectionCycle({ projectId: 'demo' });
  assert.equal(reflection.nudges.length, 1);
  assert.equal(listLongTermMemories({ projectId: 'demo', memoryType: 'pattern' }).length, 1);
});

test('prunes long-term memories by retention policy', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-memory-prune-'));
  process.env.DROIDSWARM_HOME = home;
  createLongTermMemory({
    projectId: 'demo',
    memoryType: 'semantic',
    droidspeakSummary: 'memory:pinned old',
    englishTranslation: 'Old memory',
    expiresAt: '2000-01-01T00:00:00.000Z',
  });
  assert.equal(pruneLongTermMemories({ olderThanIso: new Date().toISOString() }) > 0, true);
});
