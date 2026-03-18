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
  CheckpointRepository: () => CheckpointRepository,
  ExecutionEventRepository: () => ExecutionEventRepository,
  OperatorActionRepository: () => OperatorActionRepository,
  PersistenceClient: () => PersistenceClient,
  RunRepository: () => RunRepository,
  TaskAttemptRepository: () => TaskAttemptRepository,
  TaskDependencyRepository: () => TaskDependencyRepository,
  TaskRepository: () => TaskRepository,
  VerificationOutcomeRepository: () => VerificationOutcomeRepository
});
module.exports = __toCommonJS(repositories_exports);
var import_node_crypto = require("node:crypto");
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
          run_id, project_id, status, metadata_json, created_at, updated_at
        ) VALUES (
          @runId, @projectId, @status, @metadataJson, @createdAt, @updatedAt
        )
      `).run({
      runId: run.runId,
      projectId: run.projectId,
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
          task_id, run_id, parent_task_id, name, status, priority, metadata_json, created_at, updated_at
        ) VALUES (
          @taskId, @runId, @parentTaskId, @name, @status, @priority, @metadataJson, @createdAt, @updatedAt
        )
      `).run({
      taskId: task.taskId,
      runId: task.runId,
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
          attempt_id, task_id, run_id, agent_name, status, metadata_json, created_at, updated_at
        ) VALUES (
          @attemptId, @taskId, @runId, @agentName, @status, @metadataJson, @createdAt, @updatedAt
        )
      `).run({
      attemptId: attempt.attemptId,
      taskId: attempt.taskId,
      runId: attempt.runId,
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
          artifact_id, attempt_id, task_id, run_id, kind, summary, content, metadata_json, created_at
        ) VALUES (
          @artifactId, @attemptId, @taskId, @runId, @kind, @summary, @content, @metadataJson, @createdAt
        )
      `).run({
      artifactId: artifact.artifactId,
      attemptId: artifact.attemptId,
      taskId: artifact.taskId,
      runId: artifact.runId,
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
          checkpoint_id, task_id, run_id, attempt_id, payload_json, created_at
        ) VALUES (
          @checkpointId, @taskId, @runId, @attemptId, @payloadJson, @createdAt
        )
      `).run({
      checkpointId: checkpoint.checkpointId,
      taskId: checkpoint.taskId,
      runId: checkpoint.runId,
      attemptId: checkpoint.attemptId ?? null,
      payloadJson: checkpoint.payloadJson,
      createdAt: checkpoint.createdAt
    });
  }
}
class BudgetEventRepository {
  constructor(database) {
    this.database = database;
  }
  record(event) {
    this.database.prepare(`
        INSERT INTO budget_events (
          event_id, run_id, task_id, detail, consumed, created_at
        ) VALUES (
          @eventId, @runId, @taskId, @detail, @consumed, @createdAt
        )
      `).run({
      eventId: event.eventId,
      runId: event.runId,
      taskId: event.taskId ?? null,
      detail: event.detail,
      consumed: event.consumed,
      createdAt: event.createdAt
    });
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
}
class PersistenceClient {
  constructor(database, runs, tasks, attempts, assignments, artifacts, checkpoints, budgets, actions, dependencies, verifications, executionEvents) {
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
      new ExecutionEventRepository(database)
    );
  }
  createRun(projectId) {
    const run = {
      runId: (0, import_node_crypto.randomUUID)(),
      projectId,
      status: "queued",
      metadata: {},
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
  CheckpointRepository,
  ExecutionEventRepository,
  OperatorActionRepository,
  PersistenceClient,
  RunRepository,
  TaskAttemptRepository,
  TaskDependencyRepository,
  TaskRepository,
  VerificationOutcomeRepository
});
