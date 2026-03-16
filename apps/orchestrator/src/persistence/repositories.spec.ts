import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openPersistenceDatabase } from './database';
import { PersistenceClient } from './repositories';
import { PersistedTask } from '../types';

const nowIso = (): string => new Date().toISOString();

describe('Orchestrator persistence repositories', () => {
  it('creates and reads runs, tasks, and artifacts reliably', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);

    const run = persistence.createRun('droidswarm');
    assert.equal(run.projectId, 'droidswarm');

    const task: PersistedTask = {
      taskId: 'task-1',
      runId: run.runId,
      name: 'phase-one',
      status: 'queued',
      priority: 'medium',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.tasks.create(task);

    const tasks = persistence.tasks.listByRun(run.runId);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].name, 'phase-one');

    const attempt = {
      attemptId: 'attempt-1',
      taskId: task.taskId,
      runId: run.runId,
      agentName: 'Planner-01',
      status: 'running',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.attempts.create(attempt);

    const artifact = {
      artifactId: 'artifact-1',
      attemptId: attempt.attemptId,
      taskId: task.taskId,
      runId: run.runId,
      kind: 'summary',
      summary: 'planned architecture',
      content: 'Detailed plan',
      createdAt: nowIso(),
    };
    persistence.artifacts.create(artifact);

    const artifacts = persistence.artifacts.listByTask(task.taskId);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].summary, 'planned architecture');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
