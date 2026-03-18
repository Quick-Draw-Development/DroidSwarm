import Database from 'better-sqlite3';

import { migrations, SchemaMigration } from './migrations';

const ensureSchemaVersionTable = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
};

const recordMigration = (database: Database.Database, migration: SchemaMigration): void => {
  database.prepare(`
    INSERT INTO schema_versions (version, description, applied_at) VALUES (@version, @description, @appliedAt)
  `).run({
    version: migration.version,
    description: migration.description,
    appliedAt: new Date().toISOString(),
  });
};

const listAppliedVersions = (database: Database.Database): Set<number> => {
  const rows = database.prepare('SELECT version FROM schema_versions ORDER BY version ASC').all() as Array<{ version: number }>;
  return new Set(rows.map((row) => row.version));
};

export const CURRENT_SCHEMA_VERSION = migrations[migrations.length - 1].version;

export const applyPersistenceSchema = (database: Database.Database): void => {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
  ensureSchemaVersionTable(database);
  const applied = listAppliedVersions(database);
  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    migration.apply(database);
    recordMigration(database, migration);
  }
};
