import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

  it('tracks dependencies and allows attempt status transitions', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);

    const run = persistence.createRun('droidswarm');
    const parent: PersistedTask = {
      taskId: 'parent',
      runId: run.runId,
      name: 'parent-task',
      status: 'queued',
      priority: 'high',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const child: PersistedTask = {
      taskId: 'child',
      runId: run.runId,
      parentTaskId: parent.taskId,
      name: 'child-task',
      status: 'queued',
      priority: 'high',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.tasks.create(parent);
    persistence.tasks.create(child);

    persistence.dependencies.add({
      dependencyId: randomUUID(),
      taskId: child.taskId,
      dependsOnTaskId: parent.taskId,
      createdAt: nowIso(),
    });

    const dependencies = persistence.dependencies.listDependencies(child.taskId);
    const dependents = persistence.dependencies.listDependents(parent.taskId);
    assert.equal(dependencies.length, 1);
    assert.equal(dependents.length, 1);
    assert.equal(dependencies[0].dependsOnTaskId, parent.taskId);

    const attempt = {
      attemptId: 'attempt-2',
      taskId: parent.taskId,
      runId: run.runId,
      agentName: 'Planner-01',
      status: 'running',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.attempts.create(attempt);
    persistence.attempts.updateStatus(attempt.attemptId, 'completed');

    const updated = db
      .prepare('SELECT status FROM task_attempts WHERE attempt_id = ?')
      .get(attempt.attemptId);
    assert.equal(updated?.status, 'completed');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
