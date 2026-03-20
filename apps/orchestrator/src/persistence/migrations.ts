import Database from 'better-sqlite3';

export interface SchemaMigration {
  version: number;
  description: string;
  apply(database: Database.Database): void;
}

export const migrations: SchemaMigration[] = [
  {
    version: 1,
    description: 'Base orchestrator persistence tables',
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
    },
  },
  {
    version: 2,
    description: 'Indexes for task, attempt, artifact, and event lookups',
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
    },
  },
  {
    version: 3,
    description: 'Checkpoint vector storage and search tables',
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
    },
  },
];
