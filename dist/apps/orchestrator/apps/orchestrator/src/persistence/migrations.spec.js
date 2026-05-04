var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = require("node:test");
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_os = require("node:os");
var import_database = require("./database");
var import_schema = require("./schema");
const listIndexNames = (database, table) => database.prepare(`PRAGMA index_list('${table}')`).all().map((row) => row.name);
(0, import_node_test.describe)("persistence schema migrations", () => {
  (0, import_node_test.it)("records applied versions and exposes indexes", () => {
    const workspace = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-migrations-"));
    const dbPath = import_node_path.default.join(workspace, "state.db");
    const database = (0, import_database.openPersistenceDatabase)(dbPath);
    const versions = database.prepare("SELECT version FROM schema_versions ORDER BY version ASC").all().map((row) => row.version);
    import_strict.default.deepEqual(versions, Array.from({ length: import_schema.CURRENT_SCHEMA_VERSION }, (_, i) => i + 1));
    const taskIndexes = listIndexNames(database, "tasks");
    import_strict.default.ok(taskIndexes.includes("idx_tasks_run_status"));
    import_strict.default.ok(taskIndexes.includes("idx_tasks_parent"));
    const attemptIndexes = listIndexNames(database, "task_attempts");
    import_strict.default.ok(attemptIndexes.includes("idx_task_attempts_task"));
    const artifactIndexes = listIndexNames(database, "artifacts");
    import_strict.default.ok(artifactIndexes.includes("idx_artifacts_task"));
    const eventIndexes = listIndexNames(database, "execution_events");
    import_strict.default.ok(eventIndexes.includes("idx_execution_events_run"));
    database.close();
    (0, import_node_fs.rmSync)(workspace, { recursive: true, force: true });
  });
});
