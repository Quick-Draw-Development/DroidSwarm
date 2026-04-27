import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export { openPersistenceDatabase } from '../../../apps/orchestrator/src/persistence/database';
export { applyPersistenceSchema } from '../../../apps/orchestrator/src/persistence/schema';
export { PersistenceClient } from '../../../apps/orchestrator/src/persistence/repositories';

export const resolveDroidSwarmHome = (): string =>
  process.env.DROIDSWARM_HOME ?? path.resolve(process.env.HOME ?? process.cwd(), '.droidswarm');

export const resolveLongTermMemoryDbPath = (): string =>
  process.env.DROIDSWARM_MEMORY_DB_PATH ?? path.resolve(resolveDroidSwarmHome(), 'memory.db');

const ensureDirectory = (target: string): void => {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
};

export const openLongTermMemoryDatabase = (dbPath = resolveLongTermMemoryDbPath()): Database.Database => {
  ensureDirectory(path.dirname(dbPath));
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS long_term_memory (
      memory_id TEXT PRIMARY KEY,
      project_id TEXT,
      session_id TEXT,
      scope TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      droidspeak_summary TEXT NOT NULL,
      english_translation TEXT NOT NULL,
      source_event_hash TEXT,
      source_task_id TEXT,
      source_run_id TEXT,
      relevance_score REAL NOT NULL,
      embedding_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      expires_at TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_long_term_memory_scope
      ON long_term_memory(scope, project_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_long_term_memory_type
      ON long_term_memory(memory_type, timestamp DESC);
  `);
  return database;
};
