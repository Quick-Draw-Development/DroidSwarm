import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { OrchestratorPersistenceService } from './persistence/service';
import { RunLifecycleService } from './run-lifecycle';
import { finalizeRunOnShutdown } from './run-shutdown';

describe('run shutdown helper', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-shutdown-'));
  const dbPath = path.join(workspace, 'state.db');
  const database = openPersistenceDatabase(dbPath);
  const persistence = PersistenceClient.fromDatabase(database);
  const runLifecycle = new RunLifecycleService(persistence);

  it('skips terminal runs', () => {
    const run = persistence.createRun('droidswarm');
    runLifecycle.completeRun(run, 'already done');
    const result = finalizeRunOnShutdown(persistence, runLifecycle, run.runId);
    assert.equal(result, 'noop');
    const events = database
      .prepare('SELECT event_type FROM execution_events WHERE run_id = ?')
      .all(run.runId) as Array<{ event_type: string }>;
    assert.ok(events.some((row) => row.event_type === 'run_completed'));
  });

  it('completes run when tasks are terminal', () => {
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: 'terminal-task',
      name: 'done',
      priority: 'medium',
      status: 'completed',
    });

    const result = finalizeRunOnShutdown(persistence, runLifecycle, run.runId);
    assert.equal(result, 'completed');
    assert.equal(persistence.runs.get(run.runId)?.status, 'completed');
    const events = database
      .prepare('SELECT event_type FROM execution_events WHERE run_id = ? ORDER BY created_at ASC')
      .all(run.runId) as Array<{ event_type: string }>;
    assert.ok(events.some((row) => row.event_type === 'run_completed'));
  });

  it('records interruption when active tasks remain', () => {
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: 'running-task',
      name: 'in-flight',
      priority: 'medium',
      status: 'running',
    });

    const result = finalizeRunOnShutdown(persistence, runLifecycle, run.runId);
    assert.equal(result, 'interrupted');
    assert.equal(persistence.runs.get(run.runId)?.status, 'running');
    const eventRow = database
      .prepare('SELECT event_type FROM execution_events WHERE run_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(run.runId) as { event_type: string } | undefined;
    assert.equal(eventRow?.event_type, 'run_interrupted');
  });

  it('does not duplicate interruption events for repeated calls', () => {
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);
    service.createTask({
      taskId: 'running-task-2',
      name: 'still running',
      priority: 'medium',
      status: 'running',
    });

    const first = finalizeRunOnShutdown(persistence, runLifecycle, run.runId);
    const second = finalizeRunOnShutdown(persistence, runLifecycle, run.runId);
    assert.equal(first, 'interrupted');
    assert.equal(second, 'interrupted');
    const rows = database
      .prepare('SELECT COUNT(*) as count FROM execution_events WHERE run_id = ? AND event_type = ?')
      .get(run.runId, 'run_interrupted') as { count: number };
    assert.equal(rows.count, 1);
  });

  after(() => {
    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });
});
