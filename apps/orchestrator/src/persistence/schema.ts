import Database from 'better-sqlite3';

export const applyPersistenceSchema = (database: Database.Database): void => {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
};
