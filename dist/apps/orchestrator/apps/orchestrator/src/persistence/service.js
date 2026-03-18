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
var service_exports = {};
__export(service_exports, {
  OrchestratorPersistenceService: () => OrchestratorPersistenceService
});
module.exports = __toCommonJS(service_exports);
var import_node_crypto = require("node:crypto");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
class OrchestratorPersistenceService {
  constructor(persistence, run) {
    this.persistence = persistence;
    this.run = run;
  }
  createTask(task) {
    const record = {
      taskId: task.taskId,
      runId: this.run.runId,
      parentTaskId: task.parentTaskId,
      name: task.name,
      status: task.status ?? "queued",
      priority: task.priority,
      metadata: task.metadata,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.persistence.tasks.create(record);
    return record;
  }
  createAttempt(attemptId, task, agentName, role, metadata) {
    const attempt = {
      attemptId,
      taskId: task.taskId,
      runId: this.run.runId,
      agentName,
      status: "running",
      metadata: metadata ? { role, ...metadata } : { role },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.persistence.attempts.create(attempt);
    return attempt;
  }
  setTaskStatus(taskId, status) {
    const existing = this.persistence.tasks.get(taskId);
    if (!existing) {
      return;
    }
    const updated = {
      ...existing,
      status,
      updatedAt: nowIso()
    };
    this.persistence.tasks.create(updated);
  }
  updateTaskPriority(taskId, priority) {
    const existing = this.persistence.tasks.get(taskId);
    if (!existing) {
      return;
    }
    const updated = {
      ...existing,
      priority,
      updatedAt: nowIso()
    };
    this.persistence.tasks.create(updated);
  }
  getTasks() {
    return this.persistence.tasks.listByRun(this.run.runId);
  }
  getTask(taskId) {
    return this.persistence.tasks.get(taskId) ?? void 0;
  }
  recordAssignment(agentName, attemptId) {
    this.persistence.assignments.assign({
      assignmentId: (0, import_node_crypto.randomUUID)(),
      attemptId,
      agentName,
      assignedAt: nowIso()
    });
  }
  addDependency(taskId, dependsOnTaskId) {
    this.persistence.dependencies.add({
      dependencyId: (0, import_node_crypto.randomUUID)(),
      taskId,
      dependsOnTaskId,
      createdAt: nowIso()
    });
  }
  listDependencies(taskId) {
    return this.persistence.dependencies.listDependencies(taskId);
  }
  listDependents(taskId) {
    return this.persistence.dependencies.listDependents(taskId);
  }
  updateAttemptStatus(attemptId, status, metadata) {
    this.persistence.attempts.updateStatus(attemptId, status, metadata);
  }
  updateAttemptMetadata(attemptId, metadata) {
    this.persistence.updateAttemptMetadata(attemptId, metadata);
  }
  listAttemptsForTask(taskId) {
    return this.persistence.database.prepare("SELECT * FROM task_attempts WHERE task_id = ?").all(taskId).map((row) => ({
      attemptId: row.attempt_id,
      taskId: row.task_id,
      runId: row.run_id,
      agentName: row.agent_name,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : void 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  getAttempt(attemptId) {
    const row = this.persistence.database.prepare("SELECT * FROM task_attempts WHERE attempt_id = ?").get(attemptId);
    if (!row) {
      return void 0;
    }
    return {
      attemptId: row.attempt_id,
      taskId: row.task_id,
      runId: row.run_id,
      agentName: row.agent_name,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : void 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  recordArtifact(input) {
    if (!input.attemptId) {
      console.warn("[OrchestratorPersistenceService] skipping artifact without attemptId", input.artifactId);
      return;
    }
    this.persistence.artifacts.create({
      artifactId: input.artifactId,
      attemptId: input.attemptId,
      taskId: input.taskId,
      runId: this.run.runId,
      kind: input.kind,
      summary: input.summary,
      content: input.content,
      metadata: input.metadata,
      createdAt: input.createdAt
    });
  }
  incrementAttemptSideEffectCount(attemptId) {
    const attempt = this.getAttempt(attemptId);
    const existingCount = attempt?.metadata?.side_effect_count ?? 0;
    const nextCount = existingCount + 1;
    this.updateAttemptMetadata(attemptId, {
      ...attempt?.metadata ?? {},
      side_effect_count: nextCount
    });
    return nextCount;
  }
  recordCheckpoint(taskId, attemptId, payload) {
    const checkpointId = (0, import_node_crypto.randomUUID)();
    this.persistence.checkpoints.create({
      checkpointId,
      taskId,
      runId: this.run.runId,
      attemptId: attemptId ?? void 0,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso()
    });
    return checkpointId;
  }
  getLatestCheckpoint(taskId) {
    const row = this.persistence.database.prepare("SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(taskId);
    if (!row) {
      return void 0;
    }
    return {
      checkpointId: row.checkpoint_id,
      taskId: row.task_id,
      runId: row.run_id,
      attemptId: row.attempt_id ?? void 0,
      payloadJson: row.payload_json ?? "",
      createdAt: row.created_at
    };
  }
  getArtifactsForTask(taskId) {
    return this.persistence.artifacts.listByTask(taskId);
  }
  recordVerificationOutcome(params) {
    this.persistence.verifications.record({
      reviewId: (0, import_node_crypto.randomUUID)(),
      runId: this.run.runId,
      taskId: params.taskId,
      attemptId: params.attemptId,
      stage: params.stage,
      status: params.status,
      summary: params.summary,
      details: params.details,
      reviewer: params.reviewer,
      createdAt: nowIso()
    });
  }
  recordBudgetEvent(taskId, detail, consumed) {
    this.persistence.budgets.record({
      eventId: (0, import_node_crypto.randomUUID)(),
      runId: this.run.runId,
      taskId: taskId ?? null,
      detail,
      consumed,
      createdAt: nowIso()
    });
  }
  recordOperatorAction(action) {
    this.persistence.actions.record({
      actionId: (0, import_node_crypto.randomUUID)(),
      runId: this.run.runId,
      taskId: action.taskId,
      actionType: action.actionType,
      detail: action.detail,
      metadataJson: action.metadata ? JSON.stringify(action.metadata) : void 0,
      createdAt: nowIso()
    });
  }
  recordExecutionEvent(eventType, detail, metadata) {
    this.persistence.recordExecutionEvent(this.run.runId, eventType, detail, metadata);
  }
  updateTaskMetadata(taskId, metadata) {
    const existing = this.persistence.tasks.get(taskId);
    if (!existing) {
      return;
    }
    const updated = {
      ...existing,
      metadata,
      updatedAt: nowIso()
    };
    this.persistence.tasks.create(updated);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OrchestratorPersistenceService
});
