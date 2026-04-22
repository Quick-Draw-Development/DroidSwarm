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
var import_embeddings = require("../utils/embeddings");
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
class OrchestratorPersistenceService {
  constructor(persistence, run) {
    this.persistence = persistence;
    this.run = run;
  }
  resolveScope(overrides) {
    return {
      projectId: overrides?.projectId ?? this.run.projectId,
      repoId: overrides?.repoId ?? this.run.repoId,
      rootPath: overrides?.rootPath ?? this.run.rootPath,
      branch: overrides?.branch ?? this.run.branch,
      workspaceId: overrides?.workspaceId ?? this.run.workspaceId
    };
  }
  getRunRecord() {
    return this.run;
  }
  updateRunMetadata(metadata) {
    this.run.metadata = metadata;
    this.run.updatedAt = nowIso();
    this.persistence.runs.updateMetadata(this.run.runId, metadata);
  }
  recordSwarmTopologySnapshot() {
    const snapshot = this.persistence.buildSwarmTopologySnapshot(this.run.runId);
    if (!snapshot) {
      return void 0;
    }
    this.updateRunMetadata({
      ...this.run.metadata ?? {},
      topology_snapshot: snapshot
    });
    return snapshot;
  }
  createTask(task) {
    const scope = this.resolveScope({
      projectId: typeof task.metadata?.project_id === "string" ? task.metadata.project_id : void 0,
      repoId: typeof task.metadata?.repo_id === "string" ? task.metadata.repo_id : void 0,
      rootPath: typeof task.metadata?.root_path === "string" ? task.metadata.root_path : void 0,
      branch: typeof task.metadata?.branch === "string" ? task.metadata.branch : void 0,
      workspaceId: typeof task.metadata?.workspace_id === "string" ? task.metadata.workspace_id : void 0
    });
    const record = {
      taskId: task.taskId,
      runId: this.run.runId,
      projectId: scope.projectId,
      repoId: scope.repoId,
      rootPath: scope.rootPath,
      branch: scope.branch,
      workspaceId: scope.workspaceId,
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
  createAttempt(attemptId, task, agentName, role, metadata, scope) {
    const attempt = {
      attemptId,
      taskId: task.taskId,
      runId: this.run.runId,
      projectId: scope?.projectId ?? task.projectId,
      repoId: scope?.repoId ?? task.repoId,
      rootPath: scope?.rootPath ?? task.rootPath,
      branch: scope?.branch ?? task.branch,
      workspaceId: scope?.workspaceId ?? task.workspaceId,
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
    return this.persistence.attempts.listByTask(taskId);
  }
  getAttempt(attemptId) {
    return this.persistence.attempts.getById(attemptId) ?? void 0;
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
      projectId: this.run.projectId,
      repoId: this.run.repoId,
      rootPath: this.run.rootPath,
      branch: this.run.branch,
      workspaceId: this.run.workspaceId,
      kind: input.kind,
      summary: input.summary,
      content: input.content,
      metadata: input.metadata,
      createdAt: input.createdAt
    });
    this.persistence.artifactMemory.record({
      id: (0, import_node_crypto.randomUUID)(),
      taskId: input.taskId,
      runId: this.run.runId,
      projectId: this.run.projectId,
      artifactId: input.artifactId,
      kind: input.kind,
      shortSummary: input.summary,
      reasonRelevant: input.summary,
      trustConfidence: 0.7,
      sourceTaskId: input.taskId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt
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
      projectId: this.run.projectId,
      repoId: this.run.repoId,
      rootPath: this.run.rootPath,
      branch: this.run.branch,
      workspaceId: this.run.workspaceId,
      attemptId: attemptId ?? void 0,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso()
    });
    const embeddingContent = [
      typeof payload.summary === "string" ? payload.summary : "",
      typeof payload.compression?.compressed_content === "string" ? payload.compression.compressed_content : ""
    ].filter(Boolean).join(" ");
    this.persistence.vectors.record({
      checkpointId,
      taskId,
      runId: this.run.runId,
      summary: typeof payload.summary === "string" ? payload.summary : void 0,
      content: typeof payload.compression?.compressed_content === "string" ? payload.compression.compressed_content : void 0,
      embedding: (0, import_embeddings.buildEmbedding)(embeddingContent, 16),
      createdAt: nowIso()
    });
    return checkpointId;
  }
  getLatestCheckpoint(taskId) {
    return this.persistence.checkpoints.getLatestForTask(taskId) ?? void 0;
  }
  getArtifactsForTask(taskId) {
    return this.persistence.artifacts.listByTask(taskId);
  }
  recordArtifactMemory(entry) {
    this.persistence.artifactMemory.record(entry);
  }
  listArtifactMemory(taskId) {
    return this.persistence.artifactMemory.listByTask(taskId);
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
      projectId: this.run.projectId,
      repoId: this.run.repoId,
      rootPath: this.run.rootPath,
      branch: this.run.branch,
      workspaceId: this.run.workspaceId,
      taskId: taskId ?? null,
      detail,
      consumed,
      createdAt: nowIso()
    });
  }
  getRunBudgetConsumed() {
    return this.persistence.budgets.listByRun(this.run.runId).reduce((total, event) => total + event.consumed, 0);
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
  recordExecutionEvent(eventType, detail, metadata, options) {
    this.persistence.recordExecutionEvent(this.run.runId, eventType, detail, metadata, options);
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
  searchCheckpoints(query, limit) {
    return this.persistence.vectors.search(query, Math.max(1, limit));
  }
  upsertProject(project) {
    this.persistence.projects.upsert({
      ...project,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }
  upsertProjectRepo(repo) {
    this.persistence.projectRepos.upsert({
      ...repo,
      id: repo.repoId,
      branch: repo.defaultBranch,
      workspaceId: void 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }
  listProjectFacts(projectId) {
    return this.persistence.memory.listFacts(projectId);
  }
  listProjectDecisions(projectId) {
    return this.persistence.memory.listDecisions(projectId);
  }
  listProjectCheckpoints(projectId) {
    return this.persistence.memory.listCheckpoints(projectId);
  }
  recordProjectFact(fact) {
    this.persistence.memory.recordFact(fact);
  }
  recordProjectDecision(decision) {
    this.persistence.memory.recordDecision(decision);
  }
  recordProjectCheckpoint(checkpoint) {
    this.persistence.memory.recordCheckpoint(checkpoint);
  }
  recordTaskChatMessage(message) {
    this.persistence.chat.create(message);
  }
  listTaskChatMessages(taskId) {
    return this.persistence.chat.listByTask(taskId);
  }
  recordTaskStateDigest(digest) {
    this.persistence.digests.record(digest);
  }
  getLatestTaskStateDigest(taskId) {
    return this.persistence.digests.getLatestForTask(taskId) ?? void 0;
  }
  listTaskStateDigests(taskId) {
    return this.persistence.digests.listByTask(taskId);
  }
  recordHandoffPacket(packet) {
    this.persistence.handoffs.record(packet);
  }
  listHandoffPackets(taskId) {
    return this.persistence.handoffs.listByTask(taskId);
  }
  getLatestHandoffPacket(taskId, runId) {
    return this.persistence.handoffs.getLatest(taskId, runId) ?? void 0;
  }
  recordWorkerResult(taskId, attemptId, result) {
    const task = this.getTask(taskId);
    const scope = this.resolveScope(task ?? void 0);
    if (!scope.repoId || !scope.rootPath || !scope.branch) {
      return;
    }
    this.persistence.workers.recordResult({
      workerResultId: (0, import_node_crypto.randomUUID)(),
      runId: this.run.runId,
      taskId,
      attemptId,
      projectId: scope.projectId,
      repoId: scope.repoId,
      rootPath: scope.rootPath,
      branch: scope.branch,
      workspaceId: scope.workspaceId,
      engine: result.engine,
      model: result.model,
      modelTier: typeof result.metadata?.modelTier === "string" ? result.metadata.modelTier : void 0,
      queueDepth: typeof result.metadata?.queueDepth === "number" ? result.metadata.queueDepth : void 0,
      fallbackCount: typeof result.metadata?.fallbackCount === "number" ? result.metadata.fallbackCount : void 0,
      success: result.success,
      summary: result.summary,
      payloadJson: JSON.stringify(result),
      createdAt: nowIso()
    });
  }
  recordWorkerHeartbeat(heartbeat) {
    const task = this.getTask(heartbeat.taskId);
    const scope = this.resolveScope(task ?? void 0);
    if (!scope.repoId || !scope.rootPath || !scope.branch) {
      return;
    }
    this.persistence.workers.recordHeartbeat({
      heartbeatId: (0, import_node_crypto.randomUUID)(),
      ...heartbeat,
      projectId: scope.projectId,
      repoId: scope.repoId,
      rootPath: scope.rootPath,
      branch: scope.branch,
      workspaceId: scope.workspaceId,
      modelTier: heartbeat.modelTier,
      queueDepth: heartbeat.queueDepth,
      fallbackCount: heartbeat.fallbackCount
    });
  }
  listWorkerHeartbeats(attemptId) {
    return this.persistence.workers.listHeartbeatsByAttempt(attemptId);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OrchestratorPersistenceService
});
