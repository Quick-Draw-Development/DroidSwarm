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
var repositories_exports = {};
__export(repositories_exports, {
  AgentAssignmentRepository: () => AgentAssignmentRepository,
  ArtifactRepository: () => ArtifactRepository,
  BudgetEventRepository: () => BudgetEventRepository,
  ChatRepository: () => ChatRepository,
  CheckpointRepository: () => CheckpointRepository,
  CheckpointVectorRepository: () => CheckpointVectorRepository,
  ExecutionEventRepository: () => ExecutionEventRepository,
  HandoffPacketRepository: () => HandoffPacketRepository,
  MemoryRepository: () => MemoryRepository,
  OperatorActionRepository: () => OperatorActionRepository,
  PersistenceClient: () => PersistenceClient,
  ProjectRepoRepository: () => ProjectRepoRepository,
  ProjectRepository: () => ProjectRepository,
  RunRepository: () => RunRepository,
  TaskAttemptRepository: () => TaskAttemptRepository,
  TaskDependencyRepository: () => TaskDependencyRepository,
  TaskRepository: () => TaskRepository,
  TaskStateDigestRepository: () => TaskStateDigestRepository,
  VerificationOutcomeRepository: () => VerificationOutcomeRepository,
  WorkerRepository: () => WorkerRepository
});
module.exports = __toCommonJS(repositories_exports);
var import_node_crypto = require("node:crypto");
var import_embeddings = require("../utils/embeddings");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const parseJson = (value) => {
  if (!value) {
    return void 0;
  }
  try {
    return JSON.parse(value);
  } catch {
    return void 0;
  }
};
class RunRepository {
  constructor(database) {
    this.database = database;
  }
  create(run) {
    this.database.prepare(`
        INSERT OR REPLACE INTO runs (
          run_id, project_id, repo_id, root_path, branch, workspace_id, status, metadata_json, created_at, updated_at
        ) VALUES (
          @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @status, @metadataJson, @createdAt, @updatedAt
        )
      `).run({
      runId: run.runId,
      projectId: run.projectId,
      repoId: run.repoId ?? null,
      rootPath: run.rootPath ?? null,
      branch: run.branch ?? null,
      workspaceId: run.workspaceId ?? null,
      status: run.status,
      metadataJson: run.metadata ? JSON.stringify(run.metadata) : null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt
    });
  }
  get(runId) {
    const row = this.database.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
    if (!row) {
      return null;
    }
    return {
      runId: row.run_id,
      projectId: row.project_id,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      status: row.status,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  listByProject(projectId) {
    return this.database.prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC").all(projectId).map((row) => ({
      runId: row.run_id,
      projectId: row.project_id,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      status: row.status,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  updateStatus(runId, status, metadata) {
    const existing = this.get(runId);
    if (!existing) {
      return;
    }
    const updated = {
      ...existing,
      status,
      metadata: metadata ?? existing.metadata,
      updatedAt: nowIso()
    };
    this.create(updated);
  }
  listActiveRuns() {
    return this.database.prepare("SELECT * FROM runs WHERE status NOT IN (?, ?, ?) ORDER BY updated_at DESC").all("completed", "failed", "cancelled").map((row) => ({
      runId: row.run_id,
      projectId: row.project_id,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      status: row.status,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}
class ExecutionEventRepository {
  constructor(database) {
    this.database = database;
  }
  record(event) {
    this.database.prepare(`
        INSERT INTO execution_events (
          event_id, run_id, event_type, detail, metadata_json, created_at
        ) VALUES (
          @eventId, @runId, @eventType, @detail, @metadataJson, @createdAt
        )
      `).run({
      eventId: event.eventId,
      runId: event.runId,
      eventType: event.eventType,
      detail: event.detail,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
      createdAt: event.createdAt
    });
  }
}
class TaskRepository {
  constructor(database) {
    this.database = database;
  }
  create(task) {
    this.database.prepare(`
        INSERT OR REPLACE INTO tasks (
          task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, parent_task_id, name, status, priority, metadata_json, created_at, updated_at
        ) VALUES (
          @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @parentTaskId, @name, @status, @priority, @metadataJson, @createdAt, @updatedAt
        )
      `).run({
      taskId: task.taskId,
      runId: task.runId,
      projectId: task.projectId ?? null,
      repoId: task.repoId ?? null,
      rootPath: task.rootPath ?? null,
      branch: task.branch ?? null,
      workspaceId: task.workspaceId ?? null,
      parentTaskId: task.parentTaskId ?? null,
      name: task.name,
      status: task.status,
      priority: task.priority,
      metadataJson: task.metadata ? JSON.stringify(task.metadata) : null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    });
  }
  listByRun(runId) {
    return this.database.prepare("SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at ASC").all(runId).map((row) => ({
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      parentTaskId: row.parent_task_id ?? void 0,
      name: row.name,
      status: row.status,
      priority: row.priority,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  get(taskId) {
    const row = this.database.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId);
    if (!row) {
      return null;
    }
    return {
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      parentTaskId: row.parent_task_id ?? void 0,
      name: row.name,
      status: row.status,
      priority: row.priority,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
class TaskAttemptRepository {
  constructor(database) {
    this.database = database;
  }
  create(attempt) {
    this.database.prepare(`
        INSERT OR REPLACE INTO task_attempts (
          attempt_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, agent_name, status, metadata_json, created_at, updated_at
        ) VALUES (
          @attemptId, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @agentName, @status, @metadataJson, @createdAt, @updatedAt
        )
      `).run({
      attemptId: attempt.attemptId,
      taskId: attempt.taskId,
      runId: attempt.runId,
      projectId: attempt.projectId ?? null,
      repoId: attempt.repoId ?? null,
      rootPath: attempt.rootPath ?? null,
      branch: attempt.branch ?? null,
      workspaceId: attempt.workspaceId ?? null,
      agentName: attempt.agentName,
      status: attempt.status,
      metadataJson: attempt.metadata ? JSON.stringify(attempt.metadata) : null,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt
    });
  }
  updateStatus(attemptId, status, metadata) {
    this.database.prepare(`
        UPDATE task_attempts
        SET status = @status, metadata_json = @metadataJson, updated_at = @updatedAt
        WHERE attempt_id = @attemptId
      `).run({
      attemptId,
      status,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      updatedAt: nowIso()
    });
  }
  updateMetadata(attemptId, metadata) {
    this.database.prepare(`
        UPDATE task_attempts
        SET metadata_json = @metadataJson, updated_at = @updatedAt
        WHERE attempt_id = @attemptId
      `).run({
      attemptId,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      updatedAt: nowIso()
    });
  }
  listByTask(taskId) {
    return this.database.prepare("SELECT * FROM task_attempts WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      attemptId: row.attempt_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      agentName: row.agent_name,
      status: row.status,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  getById(attemptId) {
    const row = this.database.prepare("SELECT * FROM task_attempts WHERE attempt_id = ?").get(attemptId);
    if (!row) {
      return null;
    }
    return {
      attemptId: row.attempt_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      agentName: row.agent_name,
      status: row.status,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
class AgentAssignmentRepository {
  constructor(database) {
    this.database = database;
  }
  assign(agent) {
    this.database.prepare(`
        INSERT INTO agent_assignments (
          assignment_id, attempt_id, agent_name, assigned_at
        ) VALUES (
          @assignmentId, @attemptId, @agentName, @assignedAt
        )
      `).run({
      assignmentId: agent.assignmentId,
      attemptId: agent.attemptId,
      agentName: agent.agentName,
      assignedAt: agent.assignedAt
    });
  }
}
class ArtifactRepository {
  constructor(database) {
    this.database = database;
  }
  create(artifact) {
    this.database.prepare(`
        INSERT INTO artifacts (
          artifact_id, attempt_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, kind, summary, content, metadata_json, created_at
        ) VALUES (
          @artifactId, @attemptId, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @kind, @summary, @content, @metadataJson, @createdAt
        )
      `).run({
      artifactId: artifact.artifactId,
      attemptId: artifact.attemptId,
      taskId: artifact.taskId,
      runId: artifact.runId,
      projectId: artifact.projectId ?? null,
      repoId: artifact.repoId ?? null,
      rootPath: artifact.rootPath ?? null,
      branch: artifact.branch ?? null,
      workspaceId: artifact.workspaceId ?? null,
      kind: artifact.kind,
      summary: artifact.summary,
      content: artifact.content,
      metadataJson: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
      createdAt: artifact.createdAt
    });
  }
  listByTask(taskId) {
    return this.database.prepare("SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      artifactId: row.artifact_id,
      attemptId: row.attempt_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      kind: row.kind,
      summary: row.summary,
      content: row.content,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at
    }));
  }
}
class CheckpointRepository {
  constructor(database) {
    this.database = database;
  }
  create(checkpoint) {
    this.database.prepare(`
        INSERT INTO checkpoints (
          checkpoint_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id, attempt_id, payload_json, created_at
        ) VALUES (
          @checkpointId, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @attemptId, @payloadJson, @createdAt
        )
      `).run({
      checkpointId: checkpoint.checkpointId,
      taskId: checkpoint.taskId,
      runId: checkpoint.runId,
      projectId: checkpoint.projectId ?? null,
      repoId: checkpoint.repoId ?? null,
      rootPath: checkpoint.rootPath ?? null,
      branch: checkpoint.branch ?? null,
      workspaceId: checkpoint.workspaceId ?? null,
      attemptId: checkpoint.attemptId ?? null,
      payloadJson: checkpoint.payloadJson,
      createdAt: checkpoint.createdAt
    });
  }
  getLatestForTask(taskId) {
    const row = this.database.prepare("SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(taskId);
    if (!row) {
      return null;
    }
    return {
      checkpointId: row.checkpoint_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      attemptId: row.attempt_id ?? void 0,
      payloadJson: row.payload_json,
      createdAt: row.created_at
    };
  }
}
class CheckpointVectorRepository {
  constructor(database) {
    this.database = database;
  }
  record(entry) {
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM checkpoint_vectors WHERE checkpoint_id = ?").run(entry.checkpointId);
      this.database.prepare("DELETE FROM checkpoint_vectors_search WHERE checkpoint_id = ?").run(entry.checkpointId);
      this.database.prepare(
        `INSERT INTO checkpoint_vectors (
            checkpoint_id, task_id, run_id, summary, content, embedding_json, created_at
          ) VALUES (
            @checkpointId, @taskId, @runId, @summary, @content, @embeddingJson, @createdAt
          )`
      ).run({
        checkpointId: entry.checkpointId,
        taskId: entry.taskId,
        runId: entry.runId,
        summary: entry.summary ?? null,
        content: entry.content ?? null,
        embeddingJson: JSON.stringify(entry.embedding),
        createdAt: entry.createdAt
      });
      this.database.prepare("INSERT INTO checkpoint_vectors_search (checkpoint_id, summary, content) VALUES (?, ?, ?)").run(entry.checkpointId, entry.summary ?? "", entry.content ?? "");
    });
    transaction();
  }
  search(query, limit) {
    const queryEmbedding = (0, import_embeddings.buildEmbedding)(query);
    const rows = this.database.prepare(
      `SELECT c.*, c.embedding_json FROM checkpoint_vectors c
         JOIN checkpoint_vectors_search fts ON c.checkpoint_id = fts.checkpoint_id
         WHERE checkpoint_vectors_search MATCH ?
         ORDER BY created_at DESC
         LIMIT ?`
    ).all(query, limit);
    return rows.map((row) => {
      const embedding = JSON.parse(row.embedding_json);
      return {
        checkpointId: row.checkpoint_id,
        taskId: row.task_id,
        runId: row.run_id,
        summary: row.summary ?? void 0,
        content: row.content ?? void 0,
        embedding,
        createdAt: row.created_at,
        score: (0, import_embeddings.cosineSimilarity)(queryEmbedding, embedding)
      };
    }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}
class BudgetEventRepository {
  constructor(database) {
    this.database = database;
  }
  record(event) {
    this.database.prepare(`
        INSERT INTO budget_events (
          event_id, run_id, project_id, repo_id, root_path, branch, workspace_id, task_id, detail, consumed, created_at
        ) VALUES (
          @eventId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId, @taskId, @detail, @consumed, @createdAt
        )
      `).run({
      eventId: event.eventId,
      runId: event.runId,
      projectId: event.projectId ?? null,
      repoId: event.repoId ?? null,
      rootPath: event.rootPath ?? null,
      branch: event.branch ?? null,
      workspaceId: event.workspaceId ?? null,
      taskId: event.taskId ?? null,
      detail: event.detail,
      consumed: event.consumed,
      createdAt: event.createdAt
    });
  }
  listByTask(taskId) {
    return this.database.prepare("SELECT * FROM budget_events WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      eventId: row.event_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      taskId: row.task_id ?? void 0,
      detail: row.detail,
      consumed: row.consumed,
      createdAt: row.created_at
    }));
  }
  listByRun(runId) {
    return this.database.prepare("SELECT * FROM budget_events WHERE run_id = ? ORDER BY created_at ASC").all(runId).map((row) => ({
      eventId: row.event_id,
      runId: row.run_id,
      projectId: row.project_id ?? void 0,
      repoId: row.repo_id ?? void 0,
      rootPath: row.root_path ?? void 0,
      branch: row.branch ?? void 0,
      workspaceId: row.workspace_id ?? void 0,
      taskId: row.task_id ?? void 0,
      detail: row.detail,
      consumed: row.consumed,
      createdAt: row.created_at
    }));
  }
}
class OperatorActionRepository {
  constructor(database) {
    this.database = database;
  }
  record(action) {
    this.database.prepare(`
        INSERT INTO operator_actions (
          action_id, run_id, task_id, action_type, detail, metadata_json, created_at
        ) VALUES (
          @actionId, @runId, @taskId, @actionType, @detail, @metadataJson, @createdAt
        )
      `).run({
      actionId: action.actionId,
      runId: action.runId,
      taskId: action.taskId ?? null,
      actionType: action.actionType,
      detail: action.detail,
      metadataJson: action.metadataJson ?? null,
      createdAt: action.createdAt
    });
  }
  listByTask(taskId) {
    return this.database.prepare("SELECT * FROM operator_actions WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      actionId: row.action_id,
      runId: row.run_id,
      taskId: row.task_id ?? void 0,
      actionType: row.action_type,
      detail: row.detail,
      metadataJson: row.metadata_json ?? void 0,
      createdAt: row.created_at
    }));
  }
}
class TaskDependencyRepository {
  constructor(database) {
    this.database = database;
  }
  add(dependency) {
    this.database.prepare(`
        INSERT OR REPLACE INTO task_dependencies (
          dependency_id, task_id, depends_on_task_id, created_at
        ) VALUES (
          @dependencyId, @taskId, @dependsOnTaskId, @createdAt
        )
      `).run({
      dependencyId: dependency.dependencyId,
      taskId: dependency.taskId,
      dependsOnTaskId: dependency.dependsOnTaskId,
      createdAt: dependency.createdAt
    });
  }
  listDependencies(taskId) {
    return this.database.prepare("SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      dependencyId: row.dependency_id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      createdAt: row.created_at ?? ""
    }));
  }
  listDependents(taskId) {
    return this.database.prepare("SELECT * FROM task_dependencies WHERE depends_on_task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      dependencyId: row.dependency_id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      createdAt: row.created_at ?? ""
    }));
  }
}
class VerificationOutcomeRepository {
  constructor(database) {
    this.database = database;
  }
  record(outcome) {
    this.database.prepare(`
        INSERT INTO verification_reviews (
          review_id, run_id, task_id, attempt_id, stage, status, summary, details, reviewer, created_at
        ) VALUES (
          @reviewId, @runId, @taskId, @attemptId, @stage, @status, @summary, @details, @reviewer, @createdAt
        )
      `).run({
      reviewId: outcome.reviewId,
      runId: outcome.runId,
      taskId: outcome.taskId,
      attemptId: outcome.attemptId ?? null,
      stage: outcome.stage,
      status: outcome.status,
      summary: outcome.summary ?? null,
      details: outcome.details ?? null,
      reviewer: outcome.reviewer ?? null,
      createdAt: outcome.createdAt
    });
  }
  listByTask(taskId) {
    return this.database.prepare("SELECT * FROM verification_reviews WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      reviewId: row.review_id,
      runId: row.run_id,
      taskId: row.task_id,
      attemptId: row.attempt_id ?? void 0,
      stage: row.stage,
      status: row.status,
      summary: row.summary ?? void 0,
      details: row.details ?? void 0,
      reviewer: row.reviewer ?? void 0,
      createdAt: row.created_at
    }));
  }
}
class ProjectRepository {
  constructor(database) {
    this.database = database;
  }
  upsert(project) {
    this.database.prepare(`
      INSERT INTO projects (project_id, name, description, metadata_json, created_at, updated_at)
      VALUES (@projectId, @name, @description, @metadataJson, @createdAt, @updatedAt)
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run({
      projectId: project.projectId,
      name: project.name,
      description: project.description ?? null,
      metadataJson: project.metadata ? JSON.stringify(project.metadata) : null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    });
  }
  list() {
    return this.database.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map((row) => ({
      projectId: row.project_id,
      name: row.name,
      description: row.description ?? void 0,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}
class ProjectRepoRepository {
  constructor(database) {
    this.database = database;
  }
  upsert(repo) {
    this.database.prepare(`
      INSERT INTO project_repos (
        repo_id, project_id, name, root_path, default_branch, main_branch, develop_branch, allowed_roots_json, metadata_json, created_at, updated_at
      ) VALUES (
        @repoId, @projectId, @name, @rootPath, @defaultBranch, @mainBranch, @developBranch, @allowedRootsJson, @metadataJson, @createdAt, @updatedAt
      )
      ON CONFLICT(repo_id) DO UPDATE SET
        name = excluded.name,
        root_path = excluded.root_path,
        default_branch = excluded.default_branch,
        main_branch = excluded.main_branch,
        develop_branch = excluded.develop_branch,
        allowed_roots_json = excluded.allowed_roots_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run({
      repoId: repo.repoId,
      projectId: repo.projectId,
      name: repo.name,
      rootPath: repo.rootPath,
      defaultBranch: repo.defaultBranch,
      mainBranch: repo.mainBranch,
      developBranch: repo.developBranch,
      allowedRootsJson: JSON.stringify(repo.allowedRoots),
      metadataJson: repo.metadata ? JSON.stringify(repo.metadata) : null,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt
    });
  }
  listByProject(projectId) {
    return this.database.prepare("SELECT * FROM project_repos WHERE project_id = ? ORDER BY updated_at DESC").all(projectId).map((row) => ({
      id: row.repo_id,
      repoId: row.repo_id,
      projectId: row.project_id,
      name: row.name,
      rootPath: row.root_path,
      branch: row.default_branch,
      defaultBranch: row.default_branch,
      mainBranch: row.main_branch,
      developBranch: row.develop_branch,
      workspaceId: void 0,
      allowedRoots: parseJson(row.allowed_roots_json) ?? [row.root_path]
    }));
  }
  get(repoId) {
    const row = this.database.prepare("SELECT * FROM project_repos WHERE repo_id = ?").get(repoId);
    if (!row) {
      return null;
    }
    return {
      id: row.repo_id,
      repoId: row.repo_id,
      projectId: row.project_id,
      name: row.name,
      rootPath: row.root_path,
      branch: row.default_branch,
      defaultBranch: row.default_branch,
      mainBranch: row.main_branch,
      developBranch: row.develop_branch,
      workspaceId: void 0,
      allowedRoots: parseJson(row.allowed_roots_json) ?? [row.root_path]
    };
  }
}
class MemoryRepository {
  constructor(database) {
    this.database = database;
  }
  recordFact(fact) {
    this.database.prepare(`
      INSERT OR REPLACE INTO project_facts (
        fact_id, project_id, repo_id, scope, statement, confidence, evidence_refs_json, status, created_at
      ) VALUES (
        @id, @projectId, @repoId, @scope, @statement, @confidence, @evidenceRefsJson, @status, @createdAt
      )
    `).run({
      ...fact,
      evidenceRefsJson: JSON.stringify(fact.evidenceRefs)
    });
  }
  recordDecision(decision) {
    this.database.prepare(`
      INSERT OR REPLACE INTO project_decisions (
        decision_id, project_id, repo_id, summary, why, alternatives_rejected_json, evidence_refs_json, created_at
      ) VALUES (
        @id, @projectId, @repoId, @summary, @why, @alternativesRejectedJson, @evidenceRefsJson, @createdAt
      )
    `).run({
      ...decision,
      alternativesRejectedJson: JSON.stringify(decision.alternativesRejected),
      evidenceRefsJson: JSON.stringify(decision.evidenceRefs)
    });
  }
  recordCheckpoint(checkpoint) {
    this.database.prepare(`
      INSERT OR REPLACE INTO project_checkpoints (
        project_checkpoint_id, project_id, repo_id, run_id, summary, facts_json, decisions_json, open_questions_json, component_summaries_json, created_at
      ) VALUES (
        @id, @projectId, @repoId, @runId, @summary, @factsJson, @decisionsJson, @openQuestionsJson, @componentSummariesJson, @createdAt
      )
    `).run({
      ...checkpoint,
      factsJson: JSON.stringify(checkpoint.facts),
      decisionsJson: JSON.stringify(checkpoint.decisions),
      openQuestionsJson: JSON.stringify(checkpoint.openQuestions),
      componentSummariesJson: JSON.stringify(checkpoint.componentSummaries)
    });
  }
  listFacts(projectId) {
    return this.database.prepare("SELECT * FROM project_facts WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map((row) => ({
      id: row.fact_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      scope: row.scope,
      statement: row.statement,
      confidence: row.confidence,
      evidenceRefs: parseJson(row.evidence_refs_json) ?? [],
      status: row.status,
      createdAt: row.created_at
    }));
  }
  listDecisions(projectId) {
    return this.database.prepare("SELECT * FROM project_decisions WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map((row) => ({
      id: row.decision_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      summary: row.summary,
      why: row.why,
      alternativesRejected: parseJson(row.alternatives_rejected_json) ?? [],
      evidenceRefs: parseJson(row.evidence_refs_json) ?? [],
      createdAt: row.created_at
    }));
  }
  listCheckpoints(projectId) {
    return this.database.prepare("SELECT * FROM project_checkpoints WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map((row) => ({
      id: row.project_checkpoint_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      runId: row.run_id,
      summary: row.summary,
      facts: parseJson(row.facts_json) ?? [],
      decisions: parseJson(row.decisions_json) ?? [],
      openQuestions: parseJson(row.open_questions_json) ?? [],
      componentSummaries: parseJson(row.component_summaries_json) ?? [],
      createdAt: row.created_at
    }));
  }
}
class ChatRepository {
  constructor(database) {
    this.database = database;
  }
  create(message) {
    this.database.prepare(`
      INSERT OR REPLACE INTO task_chat_messages (
        message_id, task_id, run_id, project_id, repo_id, root_path, branch, workspace_id,
        source, external_thread_id, external_message_id, author_type, author_id, body, metadata_json, created_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @repoId, @rootPath, @branch, @workspaceId,
        @source, @externalThreadId, @externalMessageId, @authorType, @authorId, @body, @metadataJson, @createdAt
      )
    `).run({
      ...message,
      repoId: message.repoId ?? null,
      rootPath: message.rootPath ?? null,
      branch: message.branch ?? null,
      workspaceId: message.workspaceId ?? null,
      externalThreadId: message.externalThreadId ?? null,
      externalMessageId: message.externalMessageId ?? null,
      metadataJson: message.metadata ? JSON.stringify(message.metadata) : null
    });
  }
  listByTask(taskId) {
    return this.database.prepare("SELECT * FROM task_chat_messages WHERE task_id = ? ORDER BY created_at ASC").all(taskId).map((row) => ({
      id: row.message_id,
      taskId: row.task_id,
      runId: row.run_id,
      projectId: row.project_id,
      source: row.source,
      externalThreadId: row.external_thread_id ?? void 0,
      externalMessageId: row.external_message_id ?? void 0,
      authorType: row.author_type,
      authorId: row.author_id,
      body: row.body,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at
    }));
  }
}
class WorkerRepository {
  constructor(database) {
    this.database = database;
  }
  recordResult(record) {
    this.database.prepare(`
      INSERT INTO worker_results (
        worker_result_id, run_id, task_id, attempt_id, project_id, repo_id, root_path, branch, workspace_id,
        engine, model, model_tier, queue_depth, fallback_count, success, summary, payload_json, created_at
      ) VALUES (
        @workerResultId, @runId, @taskId, @attemptId, @projectId, @repoId, @rootPath, @branch, @workspaceId,
        @engine, @model, @modelTier, @queueDepth, @fallbackCount, @success, @summary, @payloadJson, @createdAt
      )
    `).run({
      ...record,
      workspaceId: record.workspaceId ?? null,
      model: record.model ?? null,
      modelTier: record.modelTier ?? null,
      queueDepth: record.queueDepth ?? null,
      fallbackCount: record.fallbackCount ?? null,
      success: record.success ? 1 : 0
    });
  }
  listResultsByTask(taskId) {
    return this.database.prepare("SELECT * FROM worker_results WHERE task_id = ? ORDER BY created_at DESC").all(taskId).map((row) => ({
      workerResultId: row.worker_result_id,
      runId: row.run_id,
      taskId: row.task_id,
      attemptId: row.attempt_id,
      projectId: row.project_id,
      repoId: row.repo_id,
      rootPath: row.root_path,
      branch: row.branch,
      workspaceId: row.workspace_id ?? void 0,
      engine: row.engine,
      model: row.model ?? void 0,
      modelTier: row.model_tier,
      queueDepth: row.queue_depth ?? void 0,
      fallbackCount: row.fallback_count ?? void 0,
      success: row.success === 1,
      summary: row.summary,
      payloadJson: row.payload_json,
      createdAt: row.created_at
    }));
  }
  recordHeartbeat(record) {
    this.database.prepare(`
      INSERT INTO worker_heartbeats (
        heartbeat_id, run_id, task_id, attempt_id, project_id, repo_id, root_path, branch, workspace_id,
        engine, model_tier, queue_depth, fallback_count, heartbeat_status, elapsed_ms, last_activity, created_at
      ) VALUES (
        @heartbeatId, @runId, @taskId, @attemptId, @projectId, @repoId, @rootPath, @branch, @workspaceId,
        @engine, @modelTier, @queueDepth, @fallbackCount, @status, @elapsedMs, @lastActivity, @createdAt
      )
    `).run({
      heartbeatId: record.heartbeatId,
      runId: record.runId,
      taskId: record.taskId,
      attemptId: record.attemptId,
      projectId: record.projectId,
      repoId: record.repoId,
      rootPath: record.rootPath,
      branch: record.branch,
      workspaceId: record.workspaceId ?? null,
      engine: record.engine,
      modelTier: record.modelTier ?? null,
      queueDepth: record.queueDepth ?? null,
      fallbackCount: record.fallbackCount ?? null,
      status: record.status,
      elapsedMs: record.elapsedMs,
      lastActivity: record.lastActivity ?? null,
      createdAt: record.timestamp
    });
  }
  listHeartbeatsByAttempt(attemptId) {
    return this.database.prepare("SELECT * FROM worker_heartbeats WHERE attempt_id = ? ORDER BY created_at DESC").all(attemptId).map((row) => ({
      runId: row.run_id,
      taskId: row.task_id,
      attemptId: row.attempt_id,
      engine: row.engine,
      modelTier: row.model_tier,
      queueDepth: row.queue_depth ?? void 0,
      fallbackCount: row.fallback_count ?? void 0,
      timestamp: row.created_at,
      elapsedMs: row.elapsed_ms,
      status: row.heartbeat_status,
      lastActivity: row.last_activity ?? void 0
    }));
  }
}
class TaskStateDigestRepository {
  constructor(database) {
    this.database = database;
  }
  record(digest) {
    this.database.prepare(`
      INSERT OR REPLACE INTO task_state_digests (
        digest_id, task_id, run_id, project_id, updated_by, payload_json, created_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @updatedBy, @payloadJson, @createdAt
      )
    `).run({
      id: digest.id,
      taskId: digest.taskId,
      runId: digest.runId,
      projectId: digest.projectId,
      updatedBy: digest.lastUpdatedBy,
      payloadJson: JSON.stringify(digest),
      createdAt: digest.ts
    });
  }
  getLatestForTask(taskId) {
    const row = this.database.prepare(`
      SELECT * FROM task_state_digests
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId);
    if (!row) {
      return null;
    }
    return parseJson(row.payload_json) ?? null;
  }
}
class HandoffPacketRepository {
  constructor(database) {
    this.database = database;
  }
  record(packet) {
    this.database.prepare(`
      INSERT OR REPLACE INTO handoff_packets (
        packet_id, task_id, run_id, project_id, from_task_id, to_task_id, to_role, digest_id, payload_json, created_at
      ) VALUES (
        @id, @taskId, @runId, @projectId, @fromTaskId, @toTaskId, @toRole, @digestId, @payloadJson, @createdAt
      )
    `).run({
      ...packet,
      toTaskId: packet.toTaskId ?? null,
      payloadJson: JSON.stringify(packet),
      createdAt: packet.ts
    });
  }
  listByTask(taskId) {
    return this.database.prepare(`
      SELECT * FROM handoff_packets
      WHERE task_id = ? OR from_task_id = ? OR to_task_id = ?
      ORDER BY created_at DESC
    `).all(taskId, taskId, taskId).flatMap((row) => {
      const parsed = parseJson(row.payload_json);
      return parsed ? [parsed] : [];
    });
  }
}
class PersistenceClient {
  constructor(database, runs, tasks, attempts, assignments, artifacts, checkpoints, budgets, actions, dependencies, verifications, executionEvents, vectors, projects, projectRepos, memory, chat, workers, digests, handoffs) {
    this.database = database;
    this.runs = runs;
    this.tasks = tasks;
    this.attempts = attempts;
    this.assignments = assignments;
    this.artifacts = artifacts;
    this.checkpoints = checkpoints;
    this.budgets = budgets;
    this.actions = actions;
    this.dependencies = dependencies;
    this.verifications = verifications;
    this.executionEvents = executionEvents;
    this.vectors = vectors;
    this.projects = projects;
    this.projectRepos = projectRepos;
    this.memory = memory;
    this.chat = chat;
    this.workers = workers;
    this.digests = digests;
    this.handoffs = handoffs;
  }
  updateAttemptMetadata(attemptId, metadata) {
    this.attempts.updateMetadata(attemptId, metadata);
  }
  static fromDatabase(database) {
    return new PersistenceClient(
      database,
      new RunRepository(database),
      new TaskRepository(database),
      new TaskAttemptRepository(database),
      new AgentAssignmentRepository(database),
      new ArtifactRepository(database),
      new CheckpointRepository(database),
      new BudgetEventRepository(database),
      new OperatorActionRepository(database),
      new TaskDependencyRepository(database),
      new VerificationOutcomeRepository(database),
      new ExecutionEventRepository(database),
      new CheckpointVectorRepository(database),
      new ProjectRepository(database),
      new ProjectRepoRepository(database),
      new MemoryRepository(database),
      new ChatRepository(database),
      new WorkerRepository(database),
      new TaskStateDigestRepository(database),
      new HandoffPacketRepository(database)
    );
  }
  createRun(projectId, scope) {
    const run = {
      runId: (0, import_node_crypto.randomUUID)(),
      projectId,
      repoId: scope?.repoId,
      rootPath: scope?.rootPath,
      branch: scope?.branch,
      workspaceId: scope?.workspaceId,
      status: "queued",
      metadata: scope?.metadata ?? {},
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.runs.create(run);
    return run;
  }
  recordExecutionEvent(runId, eventType, detail, metadata) {
    this.executionEvents.record({
      eventId: (0, import_node_crypto.randomUUID)(),
      runId,
      eventType,
      detail,
      metadata,
      createdAt: nowIso()
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentAssignmentRepository,
  ArtifactRepository,
  BudgetEventRepository,
  ChatRepository,
  CheckpointRepository,
  CheckpointVectorRepository,
  ExecutionEventRepository,
  HandoffPacketRepository,
  MemoryRepository,
  OperatorActionRepository,
  PersistenceClient,
  ProjectRepoRepository,
  ProjectRepository,
  RunRepository,
  TaskAttemptRepository,
  TaskDependencyRepository,
  TaskRepository,
  TaskStateDigestRepository,
  VerificationOutcomeRepository,
  WorkerRepository
});
