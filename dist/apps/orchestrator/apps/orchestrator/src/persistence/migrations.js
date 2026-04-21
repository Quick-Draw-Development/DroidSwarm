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
var migrations_exports = {};
__export(migrations_exports, {
  migrations: () => migrations
});
module.exports = __toCommonJS(migrations_exports);
const migrations = [
  {
    version: 1,
    description: "Base orchestrator persistence tables",
    apply: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          status TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS execution_events (
          event_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          detail TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE TABLE IF NOT EXISTS tasks (
          task_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          parent_task_id TEXT,
          name TEXT NOT NULL,
          status TEXT NOT NULL,
          priority TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE TABLE IF NOT EXISTS task_attempts (
          attempt_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          status TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE TABLE IF NOT EXISTS agent_assignments (
          assignment_id TEXT PRIMARY KEY,
          attempt_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          assigned_at TEXT NOT NULL,
          FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
        );

        CREATE TABLE IF NOT EXISTS artifacts (
          artifact_id TEXT PRIMARY KEY,
          attempt_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          summary TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id),
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE TABLE IF NOT EXISTS checkpoints (
          checkpoint_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          attempt_id TEXT,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id),
          FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
        );

        CREATE TABLE IF NOT EXISTS budget_events (
          event_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          task_id TEXT,
          detail TEXT NOT NULL,
          consumed REAL NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id),
          FOREIGN KEY(task_id) REFERENCES tasks(task_id)
        );

        CREATE TABLE IF NOT EXISTS operator_actions (
          action_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          task_id TEXT,
          action_type TEXT NOT NULL,
          detail TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id),
          FOREIGN KEY(task_id) REFERENCES tasks(task_id)
        );

        CREATE TABLE IF NOT EXISTS verification_reviews (
          review_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          attempt_id TEXT,
          stage TEXT NOT NULL,
          status TEXT NOT NULL,
          summary TEXT,
          details TEXT,
          reviewer TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id),
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
        );

        CREATE TABLE IF NOT EXISTS task_dependencies (
          dependency_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          depends_on_task_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(depends_on_task_id) REFERENCES tasks(task_id)
        );
      `);
    }
  },
  {
    version: 2,
    description: "Indexes for task, attempt, artifact, and event lookups",
    apply: (database) => {
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_run_status ON tasks(run_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
        CREATE INDEX IF NOT EXISTS idx_task_attempts_task ON task_attempts(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_attempts_run_status ON task_attempts(run_id, status);
        CREATE INDEX IF NOT EXISTS idx_agent_assignments_attempt ON agent_assignments(attempt_id);
        CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
        CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
        CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id);
        CREATE INDEX IF NOT EXISTS idx_checkpoints_run ON checkpoints(run_id);
        CREATE INDEX IF NOT EXISTS idx_budget_events_run ON budget_events(run_id);
        CREATE INDEX IF NOT EXISTS idx_budget_events_task ON budget_events(task_id);
        CREATE INDEX IF NOT EXISTS idx_operator_actions_task ON operator_actions(task_id);
        CREATE INDEX IF NOT EXISTS idx_verification_reviews_task ON verification_reviews(task_id);
        CREATE INDEX IF NOT EXISTS idx_verification_reviews_run ON verification_reviews(run_id);
        CREATE INDEX IF NOT EXISTS idx_verification_reviews_stage ON verification_reviews(stage);
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends ON task_dependencies(depends_on_task_id);
        CREATE INDEX IF NOT EXISTS idx_execution_events_run ON execution_events(run_id);
        CREATE INDEX IF NOT EXISTS idx_execution_events_type ON execution_events(event_type);
      `);
    }
  },
  {
    version: 3,
    description: "Checkpoint vector storage and search tables",
    apply: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS checkpoint_vectors (
          checkpoint_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          summary TEXT,
          content TEXT,
          embedding_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS checkpoint_vectors_search USING fts5(
          checkpoint_id,
          summary,
          content
        );
      `);
    }
  },
  {
    version: 4,
    description: "Project registry, task chat, worker durability, and scoped write metadata",
    apply: (database) => {
      database.exec(`
        ALTER TABLE runs ADD COLUMN repo_id TEXT;
      `);
    }
  },
  {
    version: 5,
    description: "Nullable-safe scope columns and multi-project support",
    apply: (database) => {
      const tryExec = (statement) => {
        try {
          database.exec(statement);
        } catch {
        }
      };
      tryExec("ALTER TABLE runs ADD COLUMN root_path TEXT;");
      tryExec("ALTER TABLE runs ADD COLUMN branch TEXT;");
      tryExec("ALTER TABLE runs ADD COLUMN workspace_id TEXT;");
      tryExec("ALTER TABLE tasks ADD COLUMN project_id TEXT;");
      tryExec("ALTER TABLE tasks ADD COLUMN repo_id TEXT;");
      tryExec("ALTER TABLE tasks ADD COLUMN root_path TEXT;");
      tryExec("ALTER TABLE tasks ADD COLUMN branch TEXT;");
      tryExec("ALTER TABLE tasks ADD COLUMN workspace_id TEXT;");
      tryExec("ALTER TABLE task_attempts ADD COLUMN project_id TEXT;");
      tryExec("ALTER TABLE task_attempts ADD COLUMN repo_id TEXT;");
      tryExec("ALTER TABLE task_attempts ADD COLUMN root_path TEXT;");
      tryExec("ALTER TABLE task_attempts ADD COLUMN branch TEXT;");
      tryExec("ALTER TABLE task_attempts ADD COLUMN workspace_id TEXT;");
      tryExec("ALTER TABLE artifacts ADD COLUMN project_id TEXT;");
      tryExec("ALTER TABLE artifacts ADD COLUMN repo_id TEXT;");
      tryExec("ALTER TABLE artifacts ADD COLUMN root_path TEXT;");
      tryExec("ALTER TABLE artifacts ADD COLUMN branch TEXT;");
      tryExec("ALTER TABLE artifacts ADD COLUMN workspace_id TEXT;");
      tryExec("ALTER TABLE checkpoints ADD COLUMN project_id TEXT;");
      tryExec("ALTER TABLE checkpoints ADD COLUMN repo_id TEXT;");
      tryExec("ALTER TABLE checkpoints ADD COLUMN root_path TEXT;");
      tryExec("ALTER TABLE checkpoints ADD COLUMN branch TEXT;");
      tryExec("ALTER TABLE checkpoints ADD COLUMN workspace_id TEXT;");
      tryExec("ALTER TABLE budget_events ADD COLUMN project_id TEXT;");
      tryExec("ALTER TABLE budget_events ADD COLUMN repo_id TEXT;");
      tryExec("ALTER TABLE budget_events ADD COLUMN root_path TEXT;");
      tryExec("ALTER TABLE budget_events ADD COLUMN branch TEXT;");
      tryExec("ALTER TABLE budget_events ADD COLUMN workspace_id TEXT;");
      database.exec(`
        UPDATE tasks
        SET project_id = COALESCE(project_id, (SELECT runs.project_id FROM runs WHERE runs.run_id = tasks.run_id))
        WHERE project_id IS NULL;

        UPDATE task_attempts
        SET project_id = COALESCE(project_id, (SELECT tasks.project_id FROM tasks WHERE tasks.task_id = task_attempts.task_id))
        WHERE project_id IS NULL;

        UPDATE artifacts
        SET project_id = COALESCE(project_id, (SELECT tasks.project_id FROM tasks WHERE tasks.task_id = artifacts.task_id))
        WHERE project_id IS NULL;

        UPDATE checkpoints
        SET project_id = COALESCE(project_id, (SELECT tasks.project_id FROM tasks WHERE tasks.task_id = checkpoints.task_id))
        WHERE project_id IS NULL;

        UPDATE budget_events
        SET project_id = COALESCE(project_id, (SELECT runs.project_id FROM runs WHERE runs.run_id = budget_events.run_id))
        WHERE project_id IS NULL;

        CREATE TABLE IF NOT EXISTS projects (
          project_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_repos (
          repo_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          root_path TEXT NOT NULL,
          default_branch TEXT NOT NULL,
          main_branch TEXT NOT NULL,
          develop_branch TEXT NOT NULL,
          allowed_roots_json TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(project_id)
        );

        CREATE TABLE IF NOT EXISTS project_checkpoints (
          project_checkpoint_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          repo_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          summary TEXT NOT NULL,
          facts_json TEXT NOT NULL,
          decisions_json TEXT NOT NULL,
          open_questions_json TEXT NOT NULL,
          component_summaries_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(project_id),
          FOREIGN KEY(repo_id) REFERENCES project_repos(repo_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE TABLE IF NOT EXISTS project_facts (
          fact_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          repo_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          statement TEXT NOT NULL,
          confidence REAL NOT NULL,
          evidence_refs_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(project_id),
          FOREIGN KEY(repo_id) REFERENCES project_repos(repo_id)
        );

        CREATE TABLE IF NOT EXISTS project_decisions (
          decision_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          repo_id TEXT NOT NULL,
          summary TEXT NOT NULL,
          why TEXT NOT NULL,
          alternatives_rejected_json TEXT NOT NULL,
          evidence_refs_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(project_id),
          FOREIGN KEY(repo_id) REFERENCES project_repos(repo_id)
        );

        CREATE TABLE IF NOT EXISTS project_components (
          component_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          repo_id TEXT NOT NULL,
          name TEXT NOT NULL,
          summary TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(project_id),
          FOREIGN KEY(repo_id) REFERENCES project_repos(repo_id)
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
          run_id TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS worker_results (
          worker_result_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          attempt_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          repo_id TEXT NOT NULL,
          root_path TEXT NOT NULL,
          branch TEXT NOT NULL,
          workspace_id TEXT,
          engine TEXT NOT NULL,
          model TEXT,
          success INTEGER NOT NULL,
          summary TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id),
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
        );

        CREATE TABLE IF NOT EXISTS worker_heartbeats (
          heartbeat_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          attempt_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          repo_id TEXT NOT NULL,
          root_path TEXT NOT NULL,
          branch TEXT NOT NULL,
          workspace_id TEXT,
          engine TEXT NOT NULL,
          heartbeat_status TEXT NOT NULL,
          elapsed_ms INTEGER NOT NULL,
          last_activity TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id),
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
        );

        CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
        CREATE INDEX IF NOT EXISTS idx_project_repos_project ON project_repos(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_project_repo ON tasks(project_id, repo_id);
        CREATE INDEX IF NOT EXISTS idx_attempts_scope ON task_attempts(project_id, repo_id, branch);
        CREATE INDEX IF NOT EXISTS idx_artifacts_scope ON artifacts(project_id, repo_id, branch);
        CREATE INDEX IF NOT EXISTS idx_checkpoints_scope ON checkpoints(project_id, repo_id, branch);
        CREATE INDEX IF NOT EXISTS idx_task_chat_messages_task ON task_chat_messages(task_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_worker_results_attempt ON worker_results(attempt_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_attempt ON worker_heartbeats(attempt_id, created_at);
      `);
    }
  },
  {
    version: 6,
    description: "Envelope v2 coordination digests, handoff packets, and routing telemetry",
    apply: (database) => {
      const tryExec = (statement) => {
        try {
          database.exec(statement);
        } catch {
        }
      };
      database.exec(`
        CREATE TABLE IF NOT EXISTS task_state_digests (
          digest_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE TABLE IF NOT EXISTS handoff_packets (
          packet_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          from_task_id TEXT NOT NULL,
          to_task_id TEXT,
          to_role TEXT NOT NULL,
          digest_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(task_id),
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE INDEX IF NOT EXISTS idx_task_state_digests_task ON task_state_digests(task_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_task_state_digests_run_task ON task_state_digests(run_id, task_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_handoff_packets_task ON handoff_packets(task_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_handoff_packets_run_task ON handoff_packets(run_id, task_id, created_at DESC);
      `);
      tryExec("ALTER TABLE execution_events ADD COLUMN task_id TEXT;");
      tryExec("ALTER TABLE execution_events ADD COLUMN normalized_verb TEXT;");
      tryExec("ALTER TABLE execution_events ADD COLUMN transport_body_json TEXT;");
      tryExec("ALTER TABLE worker_results ADD COLUMN model_tier TEXT;");
      tryExec("ALTER TABLE worker_results ADD COLUMN queue_depth INTEGER;");
      tryExec("ALTER TABLE worker_results ADD COLUMN fallback_count INTEGER;");
      tryExec("ALTER TABLE worker_heartbeats ADD COLUMN model_tier TEXT;");
      tryExec("ALTER TABLE worker_heartbeats ADD COLUMN queue_depth INTEGER;");
      tryExec("ALTER TABLE worker_heartbeats ADD COLUMN fallback_count INTEGER;");
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_execution_events_task ON execution_events(task_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_events_normalized_verb ON execution_events(normalized_verb, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_worker_results_task_attempt ON worker_results(task_id, attempt_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_task_attempt ON worker_heartbeats(task_id, attempt_id, created_at DESC);
      `);
    }
  }
];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  migrations
});
