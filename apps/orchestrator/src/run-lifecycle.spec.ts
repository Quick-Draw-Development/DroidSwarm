import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { RunLifecycleService } from './run-lifecycle';
import { OrchestratorPersistenceService } from './persistence/service';

const nowIso = (): string => new Date().toISOString();

describe('RunLifecycleService', () => {
  it('starts and completes a run while recording events', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-runlifecycles-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const lifecycle = new RunLifecycleService(persistence);

    const run = persistence.createRun('droidswarm');
    lifecycle.startRun(run);

    const started = persistence.runs.get(run.runId);
    assert.equal(started?.status, 'running');

    lifecycle.completeRun(run, 'all good');
    const completed = persistence.runs.get(run.runId);
    assert.equal(completed?.status, 'completed');

    const eventRow = database
      .prepare('SELECT event_type, detail FROM execution_events WHERE run_id = ? ORDER BY created_at ASC')
      .all(run.runId) as Array<{ event_type: string; detail: string }>;
    assert.equal(eventRow.length, 2);
    assert.equal(eventRow[0]?.event_type, 'run_started');
    assert.equal(eventRow[1]?.event_type, 'run_completed');

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('recovers an interrupted run and fails pending tasks/attempts', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-runlifecycles-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const lifecycle = new RunLifecycleService(persistence);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const task = service.createTask({
      taskId: 'task-recovery',
      name: 'task',
      priority: 'medium',
      status: 'running',
    });
    const attempt = service.createAttempt('attempt-1', task, 'Agent', 'worker');

    const summaries = lifecycle.recoverInterruptedRuns();

    const runRow = persistence.runs.get(run.runId);
    assert.equal(runRow?.status, 'failed');

    const updatedTask = persistence.tasks.get(task.taskId);
    assert.equal(updatedTask?.status, 'failed');
    assert.equal(
      updatedTask?.metadata?.recovery_reason,
      `Task ${task.taskId} in status running cannot resume after restart`,
    );

    const attemptRow = service.getAttempt(attempt.attemptId);
    assert.equal(attemptRow?.status, 'failed');

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].resumedTasks.length, 0);
    assert.equal(summaries[0].failedTasks[0]?.taskId, task.taskId);

    const events = database
      .prepare('SELECT event_type FROM execution_events WHERE run_id = ?')
      .all(run.runId) as Array<{ event_type: string }>;
    assert.ok(events.some((row) => row.event_type === 'run_recovered'));

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('requeues interrupted tasks with checkpoints', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-runlifecycles-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const lifecycle = new RunLifecycleService(persistence);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const task = service.createTask({
      taskId: 'task-resume',
      name: 'task',
      priority: 'medium',
      status: 'running',
    });
    const attempt = service.createAttempt('attempt-2', task, 'Agent', 'worker');
    service.recordCheckpoint(task.taskId, attempt.attemptId, {
      summary: 'checkpoint',
    });

    const summaries = lifecycle.recoverInterruptedRuns();

    const updatedTask = persistence.tasks.get(task.taskId);
    assert.equal(updatedTask?.status, 'queued');
    assert.equal(updatedTask?.metadata?.recovery_reason, 'requeued_after_restart');

    const runRow = persistence.runs.get(run.runId);
    assert.equal(runRow?.status, 'running');
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0].resumedTasks, [task.taskId]);
    assert.equal(summaries[0].failedTasks.length, 0);

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });
});
