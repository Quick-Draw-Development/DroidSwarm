var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schema_exports = {};
__export(schema_exports, {
  CURRENT_SCHEMA_VERSION: () => CURRENT_SCHEMA_VERSION,
  applyPersistenceSchema: () => applyPersistenceSchema
});
module.exports = __toCommonJS(schema_exports);
var import_migrations = require("./migrations");
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
    appliedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
};
const listAppliedVersions = (database) => {
  const rows = database.prepare("SELECT version FROM schema_versions ORDER BY version ASC").all();
  return new Set(rows.map((row) => row.version));
};
const CURRENT_SCHEMA_VERSION = import_migrations.migrations[import_migrations.migrations.length - 1].version;
const applyPersistenceSchema = (database) => {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
  ensureSchemaVersionTable(database);
  const applied = listAppliedVersions(database);
  for (const migration of import_migrations.migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    migration.apply(database);
    recordMigration(database, migration);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CURRENT_SCHEMA_VERSION,
  applyPersistenceSchema
});
