"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPersistenceSchema = exports.CURRENT_SCHEMA_VERSION = void 0;
const migrations_1 = require("./migrations");
const ensureSchemaVersionTable = (database) => {
    database.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
};
const recordMigration = (database, migration) => {
    database.prepare(`
    INSERT INTO schema_versions (version, description, applied_at) VALUES (@version, @description, @appliedAt)
  `).run({
        version: migration.version,
        description: migration.description,
        appliedAt: new Date().toISOString(),
    });
};
const listAppliedVersions = (database) => {
    const rows = database.prepare('SELECT version FROM schema_versions ORDER BY version ASC').all();
    return new Set(rows.map((row) => row.version));
};
exports.CURRENT_SCHEMA_VERSION = migrations_1.migrations[migrations_1.migrations.length - 1].version;
const applyPersistenceSchema = (database) => {
    database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
    ensureSchemaVersionTable(database);
    const applied = listAppliedVersions(database);
    for (const migration of migrations_1.migrations) {
        if (applied.has(migration.version)) {
            continue;
        }
        migration.apply(database);
        recordMigration(database, migration);
    }
};
exports.applyPersistenceSchema = applyPersistenceSchema;
