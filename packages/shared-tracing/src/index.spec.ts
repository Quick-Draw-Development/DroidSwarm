import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import { appendAuditEvent, exportProof, getMerkleRoot, listAuditEvents, verifyChain } from './index';

const makeTempDbPath = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-audit-'));
  return path.join(directory, 'audit.db');
};

test('appendAuditEvent creates a verifiable hash chain and merkle root', () => {
  const dbPath = makeTempDbPath();
  process.env.DROIDSWARM_DB_PATH = dbPath;
  process.env.DROIDSWARM_PROJECT_ID = 'audit-project';
  process.env.DROIDSWARM_SWARM_ID = 'audit-swarm';

  for (let index = 0; index < 100; index += 1) {
    appendAuditEvent('TEST_EVENT', { index, runId: 'run-audit' }, 'node-audit', { dbPath });
  }

  const events = listAuditEvents(5, dbPath);
  assert.equal(events.length, 5);
  assert.equal(events[0]?.eventType, 'TEST_EVENT');
  assert.notEqual(getMerkleRoot(dbPath), 'empty');
  assert.equal(verifyChain(1, Number.MAX_SAFE_INTEGER, dbPath), true);

  const proof = exportProof(events[events.length - 1]!.id, dbPath);
  assert.ok(proof);
  assert.ok(proof!.proof.length > 0);
});

test('verifyChain returns false after tampering with an existing row', () => {
  const dbPath = makeTempDbPath();
  process.env.DROIDSWARM_DB_PATH = dbPath;
  process.env.DROIDSWARM_PROJECT_ID = 'audit-project';
  process.env.DROIDSWARM_SWARM_ID = 'audit-swarm';

  const first = appendAuditEvent('TEST_EVENT', { index: 1, runId: 'run-audit' }, 'node-audit', { dbPath });
  appendAuditEvent('TEST_EVENT', { index: 2, runId: 'run-audit' }, 'node-audit', { dbPath });

  const database = new Database(dbPath);
  try {
    database.prepare('UPDATE audit_log SET payload = ? WHERE id = ?').run(Buffer.from('tampered'), first.id);
  } finally {
    database.close();
  }

  assert.equal(verifyChain(1, Number.MAX_SAFE_INTEGER, dbPath), false);
});
