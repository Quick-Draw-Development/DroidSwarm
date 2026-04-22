import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import Database = require('better-sqlite3');

import { OutboundMessageWorker } from './outbound-message-worker';

const workspaces: string[] = [];

const createDatabase = () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-blink-bridge-'));
  workspaces.push(workspace);
  const db = new Database(path.join(workspace, 'state.db'));
  db.exec(`
    CREATE TABLE task_chat_messages (
      message_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_id TEXT,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      external_thread_id TEXT,
      external_message_id TEXT,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE project_chat_bindings (
      binding_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_thread_id TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
};

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

describe('OutboundMessageWorker', () => {
  it('records successful Slack mirroring with retry-aware metadata', async () => {
    const db = createDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO project_chat_bindings (
        binding_id, project_id, task_id, provider, external_thread_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('binding-1', 'project-1', 'task-1', 'slack', 'C123', '{}', now, now);
    db.prepare(`
      INSERT INTO task_chat_messages (
        message_id, task_id, run_id, project_id, source, author_type, author_id, body, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'message-1',
      'task-1',
      'run-1',
      'project-1',
      'dashboard',
      'agent',
      'planner-1',
      'Ship it.',
      JSON.stringify({ mirror_attempts: 1, existing_flag: true }),
      now,
    );

    const published: Array<{ channel: string; text: string }> = [];
    const worker = new OutboundMessageWorker({
      db,
      client: {
        publish: async () => undefined,
        publishSlack: async (input) => {
          published.push({ channel: input.channel, text: input.text });
          return { ts: 'thread-ts-1' };
        },
      },
    });

    await worker.start();

    assert.deepEqual(published, [{ channel: 'C123', text: 'Ship it.' }]);
    const row = db.prepare(`
      SELECT metadata_json
      FROM task_chat_messages
      WHERE message_id = ?
    `).get('message-1') as { metadata_json: string };
    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    assert.equal(metadata.mirrored, true);
    assert.equal(metadata.provider, 'slack');
    assert.equal(metadata.external_message_id, 'thread-ts-1');
    assert.equal(metadata.mirror_attempts, 2);
    assert.equal(metadata.mirror_failure_count, 1);
    assert.equal(metadata.mirror_last_error, null);
    assert.equal(metadata.existing_flag, true);
    db.close();
  });

  it('records Blink mirror failures without clearing prior metadata', async () => {
    const db = createDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO project_chat_bindings (
        binding_id, project_id, task_id, provider, external_thread_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('binding-2', 'project-1', 'task-2', 'blink', 'thread-9', '{}', now, now);
    db.prepare(`
      INSERT INTO task_chat_messages (
        message_id, task_id, run_id, project_id, source, author_type, author_id, body, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'message-2',
      'task-2',
      'run-1',
      'project-1',
      'dashboard',
      'agent',
      'planner-2',
      'Mirror me.',
      JSON.stringify({ existing_flag: true }),
      now,
    );

    const worker = new OutboundMessageWorker({
      db,
      client: {
        publish: async () => {
          throw new Error('Blink unavailable');
        },
        publishSlack: async () => ({}),
      },
    });

    await worker.start();

    const row = db.prepare(`
      SELECT metadata_json
      FROM task_chat_messages
      WHERE message_id = ?
    `).get('message-2') as { metadata_json: string };
    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    assert.equal(metadata.mirrored, false);
    assert.equal(metadata.provider, 'blink');
    assert.equal(metadata.mirror_attempts, 1);
    assert.equal(metadata.mirror_failure_count, 1);
    assert.equal(metadata.mirror_last_error, 'Blink unavailable');
    assert.equal(metadata.existing_flag, true);
    db.close();
  });
});
