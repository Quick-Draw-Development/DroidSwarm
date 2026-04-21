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
  applySchema: () => applySchema
});
module.exports = __toCommonJS(schema_exports);
const applySchema = (database) => {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS channels (
      channel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      channel_type TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      task_id TEXT,
      session_id TEXT,
      trace_id TEXT,
      message_type TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT,
      payload_json TEXT NOT NULL,
      reply_to_message_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_mentions (
      message_id TEXT NOT NULL,
      mentioned_type TEXT NOT NULL,
      mentioned_id TEXT NOT NULL,
      mentioned_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, mentioned_type, mentioned_id)
    );

    CREATE TABLE IF NOT EXISTS connections (
      connection_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      channel_id TEXT,
      client_type TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      auth_status TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      close_code INTEGER,
      last_seen_at TEXT,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      audit_event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      channel_id TEXT,
      connection_id TEXT,
      trace_id TEXT,
      event_type TEXT NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      handoff_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      trace_id TEXT,
      from_actor_type TEXT NOT NULL,
      from_actor_id TEXT NOT NULL,
      to_actor_type TEXT NOT NULL,
      to_actor_id TEXT,
      reason TEXT NOT NULL,
      context_json TEXT,
      expected_outcome TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guardrail_events (
      guardrail_event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      trace_id TEXT,
      span_id TEXT,
      guardrail_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      result TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traces (
      trace_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      channel_id TEXT,
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_by_type TEXT NOT NULL,
      started_by_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS spans (
      span_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      task_id TEXT,
      parent_span_id TEXT,
      span_type TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS limit_events (
      limit_event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      channel_id TEXT,
      session_id TEXT,
      trace_id TEXT,
      span_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      limit_type TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      status TEXT NOT NULL,
      threshold_name TEXT,
      current_value REAL,
      threshold_value REAL,
      retry_after_ms INTEGER,
      degraded_mode TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task_id TEXT,
      trace_id TEXT,
      checkpoint_type TEXT NOT NULL,
      summary TEXT,
      facts_json TEXT,
      recent_delta_json TEXT,
      created_by_type TEXT NOT NULL,
      created_by_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_chat_bindings (
      binding_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_thread_id TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_chat_messages (
      message_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_id TEXT,
      project_id TEXT NOT NULL,
      repo_id TEXT,
      root_path TEXT,
      branch TEXT,
      workspace_id TEXT,
      source TEXT NOT NULL,
      external_thread_id TEXT,
      external_message_id TEXT,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applySchema
});
