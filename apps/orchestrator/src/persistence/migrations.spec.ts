import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { openPersistenceDatabase } from './database';
import { CURRENT_SCHEMA_VERSION } from './schema';

const listIndexNames = (database: ReturnType<typeof openPersistenceDatabase>, table: string): string[] =>
  database
    .prepare(`PRAGMA index_list('${table}')`)
    .all()
    .map((row: { name: string }) => row.name);

describe('persistence schema migrations', () => {
  it('records applied versions and exposes indexes', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-migrations-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);

    const versions = database
      .prepare('SELECT version FROM schema_versions ORDER BY version ASC')
      .all()
      .map((row: { version: number }) => row.version);
    assert.deepEqual(versions, Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, i) => i + 1));

    const taskIndexes = listIndexNames(database, 'tasks');
    assert.ok(taskIndexes.includes('idx_tasks_run_status'));
    assert.ok(taskIndexes.includes('idx_tasks_parent'));

    const attemptIndexes = listIndexNames(database, 'task_attempts');
    assert.ok(attemptIndexes.includes('idx_task_attempts_task'));

    const artifactIndexes = listIndexNames(database, 'artifacts');
    assert.ok(artifactIndexes.includes('idx_artifacts_task'));

    const eventIndexes = listIndexNames(database, 'execution_events');
    assert.ok(eventIndexes.includes('idx_execution_events_run'));

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });
});
