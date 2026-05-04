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
var TaskScheduler_exports = {};
__export(TaskScheduler_exports, {
  TaskScheduler: () => TaskScheduler
});
module.exports = __toCommonJS(TaskScheduler_exports);
var import_node_crypto = require("node:crypto");
var import_shared_types = require("@shared-types");
var import_shared_routing = require("@shared-routing");
var import_shared_governance = require("@shared-governance");
var import_AgentSupervisor = require("../AgentSupervisor");
var import_routing = require("../services/routing.service");
var import_worker_result = require("../services/worker-result.service");
var import_branch_policy = require("../services/branch-policy.service");
var import_workspace = require("../services/workspace.service");
var import_skill_pack = require("../services/skill-pack.service");
var import_pr_automation = require("../services/pr-automation.service");
var import_coordination = require("../coordination");
const buildTaskRecord = (task) => ({
  taskId: task.taskId,
  projectId: task.projectId,
  repoId: task.repoId,
  rootPath: task.rootPath,
  workspaceId: task.workspaceId,
  title: task.name,
  description: typeof task.metadata?.description === "string" ? task.metadata.description : "",
  taskType: typeof task.metadata?.task_type === "string" ? task.metadata.task_type : "task",
  priority: task.priority,
  createdAt: task.createdAt,
  createdByUserId: typeof task.metadata?.created_by === "string" ? task.metadata.created_by : void 0,
  branchName: typeof task.metadata?.branch_name === "string" ? task.metadata.branch_name : void 0
});
const dependencySuccessStatuses = ["completed", "verified"];
const dependencyFailureStatuses = ["failed", "cancelled"];
const terminalTaskStatuses = [...dependencySuccessStatuses, ...dependencyFailureStatuses];
class TaskScheduler {
  constructor(persistenceService, supervisor, config) {
    this.persistenceService = persistenceService;
    this.supervisor = supervisor;
    this.config = config;
    this.readyQueue = /* @__PURE__ */ new Set();
    this.retryTimers = /* @__PURE__ */ new Map();
    this.pendingCheckpoints = /* @__PURE__ */ new Map();
    this.artifactCriticQueue = /* @__PURE__ */ new Set();
    this.tasksAwaitingCritic = /* @__PURE__ */ new Set();
    this.workerResultService = new import_worker_result.WorkerResultService();
    this.budgetLimitReached = false;
    this.routingService = new import_routing.RoutingService(this.config);
    this.branchPolicyService = new import_branch_policy.BranchPolicyService(this.config.gitPolicy);
    this.workspaceService = new import_workspace.WorkspaceService(this.config);
    this.skillPackService = new import_skill_pack.SkillPackService(this.config);
    this.prAutomationService = new import_pr_automation.PRAutomationService(this.config);
  }
  setEvents(events) {
    this.events = events;
  }
  handleNewTask(taskId) {
    this.readyQueue.add(taskId);
    this.schedule();
  }
  handleAgentResult(taskId, attemptId, agentName, role, rawResult) {
    const task = this.persistenceService.getTask(taskId);
    if (!task) {
      return;
    }
    const result = this.workerResultService.normalize(rawResult);
    this.clearRetry(task.taskId);
    if (!this.applyUsageConstraints(task, attemptId, result)) {
      this.schedule();
      return;
    }
    const attemptStatus = result.success ? "completed" : "failed";
    this.persistenceService.updateAttemptStatus(attemptId, attemptStatus, {
      reason_code: this.getReasonCode(result),
      summary: result.summary
    });
    this.persistenceService.recordWorkerResult(taskId, attemptId, result);
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...task.metadata ?? {},
      last_outcome_success: result.success,
      last_outcome_summary: result.summary,
      last_outcome_reason: this.getReasonCode(result)
    });
    this.buildAndPersistDigest(
      task,
      result.summary,
      agentName,
      typeof result.metadata?.compression === "object" && result.metadata.compression !== null && typeof result.metadata.compression.compressed_content === "string" ? result.metadata.compression.compressed_content : void 0
    );
    const stage = typeof task.metadata?.stage === "string" ? task.metadata.stage : void 0;
    if (stage === "artifact_verification") {
      this.handleArtifactVerificationResult(task, attemptId, agentName, result);
      return;
    }
    if (stage === "verification") {
      this.handleVerificationResult(task, attemptId, agentName, result);
      return;
    }
    if (stage === "review") {
      this.handleReviewResult(task, attemptId, agentName, result);
      return;
    }
    if (stage === "arbitration") {
      this.handleArbitrationResult(task, attemptId, agentName, result);
      return;
    }
    if (stage === "checkpoint_compression") {
      this.handleCheckpointCompressionResult(task, attemptId, agentName, result);
      return;
    }
    const limitedRequests = result.spawnRequests.slice(0, this.config.schedulerMaxFanOut);
    if (limitedRequests.length > 0) {
      const created = this.createChildTasks(
        task,
        limitedRequests,
        result.summary,
        this.getCompression(result)
      );
      if (created) {
        this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
      }
      if (limitedRequests.length < result.spawnRequests.length) {
        this.log(
          `truncated ${result.spawnRequests.length - limitedRequests.length} requested agents for ${taskId}`
        );
      }
    } else if (result.success) {
      this.persistenceService.setTaskStatus(taskId, "in_review");
      this.startVerification(task, result.summary);
    } else {
      this.persistenceService.setTaskStatus(taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
    }
    const refreshedTask = this.persistenceService.getTask(taskId);
    if (refreshedTask) {
      this.buildAndPersistDigest(
        refreshedTask,
        result.summary,
        agentName,
        typeof result.metadata?.compression === "object" && result.metadata.compression !== null && typeof result.metadata.compression.compressed_content === "string" ? result.metadata.compression.compressed_content : void 0
      );
    }
    this.enqueueCheckpoint(task, attemptId, result);
    this.maybeCollapseParallelGroup(task, result);
    this.resolveParentIfReady(task);
    this.schedule();
  }
  handleArtifactRecorded(taskId, attemptId, artifactId, kind, summary) {
    const task = this.persistenceService.getTask(taskId);
    if (!task) {
      return;
    }
    if (this.config.sideEffectActionsBeforeReview > 0 && kind === "side_effect" && !this.isSideEffectReviewTriggered(task)) {
      const count = this.persistenceService.incrementAttemptSideEffectCount(attemptId);
      if (count >= this.config.sideEffectActionsBeforeReview) {
        const detail = `Side-effect limit (${this.config.sideEffectActionsBeforeReview}) reached after ${count} actions`;
        const attempt = this.persistenceService.getAttempt(attemptId);
        this.persistenceService.updateAttemptStatus(attemptId, "blocked", {
          ...attempt?.metadata ?? {},
          reason_code: "side_effect_limit",
          summary: detail
        });
        this.recordBudgetLimit(taskId, detail, count);
        this.persistenceService.updateTaskMetadata(task.taskId, {
          ...task.metadata ?? {},
          side_effect_review: {
            triggered_at: (/* @__PURE__ */ new Date()).toISOString(),
            count,
            detail
          }
        });
        this.events?.onVerificationRequested?.(
          task.taskId,
          "review",
          this.config.agentName,
          detail
        );
        this.startReview(task, summary ?? "Side-effect review triggered");
      }
    }
    this.queueArtifactVerification(task, artifactId, summary);
    this.schedule();
  }
  schedule() {
    const pending = Array.from(this.readyQueue);
    if (pending.length === 0) {
      return;
    }
    for (const taskId of pending) {
      const task = this.persistenceService.getTask(taskId);
      if (!task) {
        this.readyQueue.delete(taskId);
        continue;
      }
      if (!this.canRun(task)) {
        continue;
      }
      this.readyQueue.delete(taskId);
      this.launch(task);
    }
  }
  canRun(task) {
    if (task.status === "running" || task.status === "cancelled") {
      return false;
    }
    if (!this.enforceBudgetLimit(task)) {
      return false;
    }
    const globalActive = this.supervisor.getActiveAgentCount();
    const codeCount = this.supervisor.countActiveAgents((agent) => this.isCodeRole(agent.role));
    if (this.config.maxConcurrentCodeAgents > 0 && codeCount >= this.config.maxConcurrentCodeAgents) {
      this.recordBudgetLimit(
        task.taskId,
        `Concurrent code agent limit (${this.config.maxConcurrentCodeAgents}) reached`,
        codeCount
      );
      return false;
    }
    if (globalActive >= this.config.maxConcurrentAgents) {
      this.recordBudgetLimit(
        task.taskId,
        `Global concurrent agent limit (${this.config.maxConcurrentAgents}) reached`,
        globalActive
      );
      return false;
    }
    if (this.getTaskDepth(task.taskId) >= this.config.schedulerMaxTaskDepth) {
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      return false;
    }
    if (!["queued", "planning", "waiting_on_dependency"].includes(task.status)) {
      return false;
    }
    const dependencies = this.persistenceService.listDependencies(task.taskId);
    if (dependencies.length === 0) {
      if (task.status === "planning") {
        this.persistenceService.setTaskStatus(task.taskId, "queued");
      }
      return task.status === "queued" || task.status === "planning";
    }
    const evaluation = this.evaluateDependencies(task, dependencies);
    if (evaluation.blockingDependency) {
      this.handleDependencyFailure(task, evaluation.blockingDependency);
      return false;
    }
    if (!evaluation.satisfied) {
      if (task.status !== "waiting_on_dependency") {
        this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
      }
      return false;
    }
    if (task.status !== "queued") {
      this.persistenceService.setTaskStatus(task.taskId, "queued");
    }
    return true;
  }
  evaluateDependencies(task, dependencies) {
    for (const dependency of dependencies) {
      const candidate = this.persistenceService.getTask(dependency.dependsOnTaskId);
      if (!candidate) {
        return { satisfied: false };
      }
      if (dependencySuccessStatuses.includes(candidate.status)) {
        continue;
      }
      if (dependencyFailureStatuses.includes(candidate.status)) {
        return { satisfied: false, blockingDependency: candidate };
      }
      return { satisfied: false };
    }
    return { satisfied: true };
  }
  handleDependencyFailure(task, dependency) {
    const reason = `Dependency ${dependency.taskId} ${dependency.status}`;
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...task.metadata ?? {},
      blocked_reason: reason
    });
    this.persistenceService.setTaskStatus(task.taskId, "failed");
    const refreshedTask = this.persistenceService.getTask(task.taskId);
    if (refreshedTask) {
      this.buildAndPersistDigest(refreshedTask, reason, this.config.agentName);
    }
    this.recordBudgetLimit(task.taskId, reason, 0);
  }
  launch(task) {
    if (this.maybeScheduleCheckpointCompression(task)) {
      this.schedule();
      return;
    }
    const record = buildTaskRecord(task);
    const metadata = task.metadata ?? {};
    const checkpoint = this.persistenceService.getLatestCheckpoint(task.taskId);
    const checkpointPayload = checkpoint ? this.parseCheckpointPayload(checkpoint) : void 0;
    const taskDigest = this.persistenceService.getLatestTaskStateDigest(task.taskId) ?? (task.parentTaskId ? this.persistenceService.getLatestTaskStateDigest(task.parentTaskId) : void 0);
    const handoffPacket = this.persistenceService.getLatestHandoffPacket(task.taskId, task.runId);
    const defaultAssignment = (0, import_AgentSupervisor.defaultRoleInstructions)(record)[0];
    const role = typeof metadata.agent_role === "string" ? metadata.agent_role : defaultAssignment.role;
    const instructions = typeof metadata.agent_instructions === "string" ? metadata.agent_instructions : defaultAssignment.instructions;
    const metadataParentSummary = typeof metadata.parent_summary === "string" ? metadata.parent_summary : void 0;
    const metadataParentDroidspeak = typeof metadata.parent_droidspeak === "string" ? metadata.parent_droidspeak : void 0;
    const parentSummary = checkpointPayload?.summary ?? metadataParentSummary;
    const parentDroidspeak = checkpointPayload?.compression?.compressed_content ?? metadataParentDroidspeak;
    if (!this.checkSideEffectBudget(task)) {
      this.readyQueue.add(task.taskId);
      return;
    }
    const effectivePolicy = this.resolveTaskPolicy(task);
    const attemptId = (0, import_node_crypto.randomUUID)();
    const routingDecision = this.routingService.decide(task, role, effectivePolicy);
    const routingTelemetry = {
      modelTier: routingDecision.modelTier ?? "local-cheap",
      routeKind: routingDecision.routeKind ?? "default-local",
      queueDepth: routingDecision.queueDepth ?? 0,
      fallbackCount: routingDecision.fallbackCount ?? 0,
      localFirst: routingDecision.localFirst ?? true,
      cloudEscalated: routingDecision.cloudEscalated ?? false,
      escalationReason: routingDecision.escalationReason
    };
    if (this.maybeSchedulePreCloudCompression(task, routingDecision)) {
      this.schedule();
      return;
    }
    if (this.maybeScheduleBottleneckFanout(task)) {
      this.schedule();
      return;
    }
    const model = routingDecision.model ?? this.selectModelForTask(task, role);
    const branch = this.resolveBranch(task, routingDecision.readOnly, record.branchName);
    const repoId = task.repoId ?? this.config.repoId;
    const rootPath = task.rootPath ?? this.config.projectRoot;
    if (!routingDecision.readOnly) {
      this.branchPolicyService.validateWriteScope({
        projectId: task.projectId ?? this.config.projectId,
        repoId,
        rootPath,
        branch,
        workspaceId: task.workspaceId,
        baseBranch: this.branchPolicyService.expectedBaseBranch(branch) ?? void 0
      });
      this.prAutomationService.ensureBranch(rootPath, branch, this.branchPolicyService.expectedBaseBranch(branch) ?? this.config.defaultBranch);
    }
    const workspace = this.workspaceService.ensureWorkspace(task, attemptId, branch, routingDecision.readOnly);
    const skillPackNames = this.skillPackService.resolveNames(role, routingDecision.skillPacks);
    const skillTexts = this.skillPackService.resolve(role, routingDecision.skillPacks);
    const spawnConsensus = this.runHighImpactConsensus(
      task,
      "agent-spawn",
      `Spawn ${role} for ${task.taskId}`,
      instructions,
      "EVT-CONSENSUS-ROUND"
    );
    if (!spawnConsensus.approved) {
      this.schedule();
      return;
    }
    const spawned = this.supervisor.startAgentForTask(
      {
        ...record,
        branchName: branch,
        repoId,
        rootPath: workspace.path,
        workspaceId: workspace.workspaceId
      },
      role,
      attemptId,
      parentSummary,
      parentDroidspeak,
      model,
      {
        engine: routingDecision.engine,
        scope: {
          projectId: task.projectId ?? this.config.projectId,
          repoId,
          rootPath: workspace.path,
          branch,
          workspaceId: workspace.workspaceId
        },
        skillPacks: skillPackNames,
        skillTexts,
        readOnly: routingDecision.readOnly,
        instructions,
        workspacePath: workspace.path,
        taskDigest,
        handoffPacket,
        modelTier: routingDecision.modelTier,
        routingTelemetry,
        requiredReads: handoffPacket?.requiredReads ?? taskDigest?.artifactIndex.map((artifact) => artifact.artifactId) ?? [],
        compactVerbDictionary: import_shared_types.COMPACT_VERB_DICTIONARY,
        governance: {
          consensusId: spawnConsensus.consensusId,
          assignmentType: "agent-spawn"
        }
      }
    );
    if (!spawned) {
      this.readyQueue.add(task.taskId);
      return;
    }
    this.persistenceService.createAttempt(
      attemptId,
      task,
      spawned.agentName,
      role,
      {
        instructions,
        parent_summary: parentSummary,
        parent_droidspeak: parentDroidspeak,
        effective_policy: effectivePolicy,
        effective_model: model,
        routing_decision: routingDecision,
        skill_packs: skillPackNames,
        skill_texts: skillTexts,
        read_only: routingDecision.readOnly,
        execution_target: spawned.executionTarget
      },
      {
        projectId: task.projectId ?? this.config.projectId,
        repoId,
        rootPath: workspace.path,
        branch,
        workspaceId: workspace.workspaceId
      }
    );
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...task.metadata ?? {},
      workspace_id: workspace.workspaceId,
      branch,
      repo_id: repoId,
      root_path: workspace.path,
      routing_decision: routingDecision,
      execution_target: spawned.executionTarget
    });
    this.persistenceService.recordAssignment(spawned.agentName, attemptId);
    this.persistenceService.updateAttemptMetadata(attemptId, {
      ...this.persistenceService.getAttempt(attemptId)?.metadata ?? {},
      routing_decision: routingDecision,
      model_tier: routingDecision.modelTier,
      queue_depth: routingDecision.queueDepth ?? 0,
      fallback_count: routingDecision.fallbackCount ?? 0,
      execution_target: spawned.executionTarget
    });
    this.persistenceService.setTaskStatus(task.taskId, "running");
    this.recordTopologySnapshot();
  }
  resolveBranch(task, readOnly, branchName) {
    if (readOnly) {
      return task.branch ?? branchName ?? this.config.defaultBranch;
    }
    const candidate = task.branch ?? branchName;
    if (candidate && /^((feature|hotfix|release|support)\/)/.test(candidate)) {
      return candidate;
    }
    const slug = task.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || task.taskId.toLowerCase();
    return `${this.config.gitPolicy.prefixes.feature}${slug}`;
  }
  createChildTasks(task, requests, parentSummary, parentDroidspeak) {
    const expandedRequests = this.expandParallelRequests(task, requests);
    const taskDepth = this.getTaskDepth(task.taskId);
    const childIds = [];
    if (taskDepth + 1 > this.config.schedulerMaxTaskDepth) {
      this.log(`max depth ${this.config.schedulerMaxTaskDepth} reached for ${task.taskId}; waiting on human`);
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
      return false;
    }
    if (!this.enforceTaskPolicy(task, expandedRequests)) {
      return false;
    }
    const approvedHandshakes = expandedRequests.map((request) => ({
      request,
      consensus: this.runHighImpactConsensus(
        task,
        "task-handoff",
        `Handoff ${task.taskId} -> ${request.role}`,
        request.instructions ?? request.reason,
        "EVT-CONSENSUS-ROUND"
      )
    }));
    if (approvedHandshakes.some((entry) => !entry.consensus.approved)) {
      return false;
    }
    for (const { request, consensus } of approvedHandshakes) {
      const childId = (0, import_node_crypto.randomUUID)();
      const childRecord = this.persistenceService.createTask({
        taskId: childId,
        name: `${task.name} \u2192 ${request.role}`,
        priority: task.priority,
        parentTaskId: task.taskId,
        status: "queued",
        metadata: {
          description: request.instructions,
          task_type: request.role,
          agent_role: request.role,
          agent_instructions: request.instructions,
          agent_reason: request.reason,
          canonical_role: request.canonicalRole,
          parent_summary: parentSummary,
          parent_droidspeak: parentDroidspeak,
          parallel_group: request.parallelGroupId,
          parallel_index: request.parallelIndex,
          parallel_total: request.parallelTotal,
          consensus_id: consensus.consensusId,
          project_id: task.projectId ?? this.config.projectId,
          repo_id: task.repoId ?? this.config.repoId,
          root_path: task.rootPath ?? this.config.projectRoot,
          branch: task.branch ?? this.config.defaultBranch
        }
      });
      this.persistenceService.addDependency(task.taskId, childId);
      const digest = this.buildAndPersistDigest(task, parentSummary, this.config.agentName, parentDroidspeak);
      const handoff = (0, import_coordination.buildHandoffPacket)({
        task: childRecord,
        fromTaskId: task.taskId,
        toTaskId: childId,
        toRole: request.role,
        digest,
        requiredReads: digest.artifactIndex.map((artifact) => artifact.artifactId),
        summary: request.instructions,
        droidspeak: (0, import_coordination.buildDroidspeakV2)("handoff_ready", `Handoff ready for ${request.role}.`)
      });
      this.persistenceService.recordHandoffPacket(handoff);
      this.persistenceService.recordExecutionEvent("handoff_ready", `Handoff packet ready for ${request.role}`, {
        taskId: childId,
        fromTaskId: task.taskId,
        digestId: digest.id,
        digestHash: digest.federationHash,
        handoffHash: handoff.federationHash,
        auditHash: handoff.auditHash,
        consensusId: consensus.consensusId
      }, {
        taskId: childId,
        normalizedVerb: "handoff.ready",
        transportBody: {
          handoffId: handoff.id,
          digestId: digest.id,
          digestHash: digest.federationHash,
          handoffHash: handoff.federationHash,
          auditHash: handoff.auditHash,
          requiredReads: handoff.requiredReads,
          toRole: request.role,
          consensus: {
            consensus_id: consensus.consensusId,
            proposal_id: consensus.proposalId,
            approved: consensus.approved,
            guardian_veto: consensus.guardianVeto,
            audit_hash: consensus.auditHash
          }
        }
      });
      this.readyQueue.add(childId);
      childIds.push(childId);
    }
    const planSummary = expandedRequests.map((request) => `${request.role}: ${request.reason}`).join(" | ") || task.name;
    if (childIds.length > 0) {
      this.recordTopologySnapshot();
      this.events?.onPlanProposed?.(
        task.taskId,
        (0, import_node_crypto.randomUUID)(),
        planSummary,
        parentSummary,
        childIds
      );
    }
    return childIds.length > 0;
  }
  runHighImpactConsensus(task, proposalType, title, summary, glyph) {
    if (!this.config.governanceEnabled) {
      return {
        approved: true
      };
    }
    const consensus = (0, import_shared_governance.runConsensusRound)({
      proposalId: `${task.taskId}:${proposalType}`,
      proposalType,
      title,
      summary,
      glyph,
      context: {
        eventType: "governance.vote",
        actorRole: typeof task.metadata?.agent_role === "string" ? task.metadata.agent_role : "orchestrator",
        swarmRole: "master",
        projectId: task.projectId ?? this.config.projectId,
        auditLoggingEnabled: true,
        dashboardEnabled: false
      }
    });
    if (!consensus.approved) {
      this.persistenceService.updateTaskMetadata(task.taskId, {
        ...task.metadata ?? {},
        blocked_reason: consensus.reason,
        consensus_id: consensus.consensusId
      });
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      this.persistenceService.recordExecutionEvent(
        "governance_consensus_blocked",
        `Consensus blocked ${proposalType} for ${task.taskId}`,
        {
          taskId: task.taskId,
          proposalType,
          consensusId: consensus.consensusId,
          reason: consensus.reason,
          guardianVeto: consensus.guardianVeto
        }
      );
    }
    return consensus;
  }
  resolveParentIfReady(task) {
    if (!task.parentTaskId) {
      return;
    }
    const parent = this.persistenceService.getTask(task.parentTaskId);
    if (!parent || parent.status !== "waiting_on_dependency") {
      return;
    }
    const dependencies = this.persistenceService.listDependencies(parent.taskId);
    const evaluation = this.evaluateDependencies(parent, dependencies);
    if (evaluation.blockingDependency) {
      this.handleDependencyFailure(parent, evaluation.blockingDependency);
      return;
    }
    const dependencyTasks = dependencies.map((dependency) => this.persistenceService.getTask(dependency.dependsOnTaskId)).filter((child) => Boolean(child));
    if (this.maybeStartArbitration(parent, dependencyTasks)) {
      return;
    }
    if (!evaluation.satisfied) {
      return;
    }
    this.persistenceService.setTaskStatus(parent.taskId, "completed");
    this.recordTopologySnapshot();
    const refreshedParent = this.persistenceService.getTask(parent.taskId);
    if (refreshedParent) {
      this.buildAndPersistDigest(refreshedParent, `${parent.name} completed`, this.config.agentName);
    }
  }
  queueArtifactVerification(task, artifactId, summary) {
    if (!artifactId || this.artifactCriticQueue.has(artifactId)) {
      return;
    }
    this.artifactCriticQueue.add(artifactId);
    this.tasksAwaitingCritic.add(task.taskId);
    const description = summary ? `Critic review: ${summary}` : `Critic review for artifact ${artifactId}`;
    const child = this.createStageTask(
      task,
      "artifact_verification",
      "critic",
      description,
      summary,
      { artifact_id: artifactId, artifact_summary: summary }
    );
    this.readyQueue.add(child.taskId);
    this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
    this.recordTopologySnapshot();
  }
  queueVerificationFixTask(parent, summary, artifacts) {
    const fixTaskId = (0, import_node_crypto.randomUUID)();
    const logRefs = artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      summary: artifact.summary,
      kind: artifact.kind
    }));
    const fixTask = this.persistenceService.createTask({
      taskId: fixTaskId,
      name: `${parent.name} \u2192 verification fix`,
      priority: parent.priority,
      parentTaskId: parent.taskId,
      metadata: {
        stage: "verification_fix",
        task_type: "verification_fix",
        failure_summary: summary,
        verification_log_refs: logRefs
      }
    });
    this.readyQueue.add(fixTask.taskId);
    this.recordTopologySnapshot();
    this.persistenceService.recordExecutionEvent(
      "verification_fix_task_created",
      `Queued verification fix task ${fixTask.taskId}`,
      {
        parentTaskId: parent.taskId,
        fixTaskId: fixTask.taskId,
        failureSummary: summary,
        verificationLogCount: artifacts.length
      }
    );
  }
  enqueueCheckpoint(task, attemptId, result) {
    const payload = this.buildCheckpointPayload(result);
    if (!payload) {
      return;
    }
    if (this.tasksAwaitingCritic.has(task.taskId)) {
      this.pendingCheckpoints.set(task.taskId, {
        attemptId,
        summary: result.summary,
        payload
      });
      return;
    }
    this.persistCheckpoint(task.taskId, attemptId, result.summary, payload);
  }
  buildCheckpointPayload(result) {
    const compression = this.getCompressionPayload(result);
    if (!compression && result.checkpointDelta.factsAdded.length === 0 && result.checkpointDelta.decisionsAdded.length === 0 && result.checkpointDelta.openQuestions.length === 0) {
      return void 0;
    }
    return {
      compression,
      summary: result.summary,
      checkpoint_delta: result.checkpointDelta
    };
  }
  persistCheckpoint(taskId, attemptId, summary, payload) {
    const checkpointId = this.persistenceService.recordCheckpoint(taskId, attemptId, payload);
    const task = this.persistenceService.getTask(taskId);
    if (task && summary) {
      this.buildAndPersistDigest(task, summary, attemptId, typeof payload.compression === "object" && payload.compression !== null && typeof payload.compression.compressed_content === "string" ? payload.compression.compressed_content : void 0);
    }
    this.events?.onCheckpointCreated?.(
      taskId,
      checkpointId,
      summary,
      payload
    );
  }
  flushPendingCheckpoint(task) {
    const pending = this.pendingCheckpoints.get(task.taskId);
    if (!pending) {
      return;
    }
    this.pendingCheckpoints.delete(task.taskId);
    this.persistCheckpoint(task.taskId, pending.attemptId, pending.summary, pending.payload);
  }
  log(message) {
    console.log("[TaskScheduler]", message);
  }
  getTaskDepth(taskId) {
    let depth = 0;
    let current = this.persistenceService.getTask(taskId);
    while (current?.parentTaskId) {
      depth += 1;
      current = this.persistenceService.getTask(current.parentTaskId);
    }
    return depth;
  }
  scheduleRetry(taskId) {
    if (this.retryTimers.has(taskId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.retryTimers.delete(taskId);
      this.readyQueue.add(taskId);
      this.schedule();
    }, this.config.schedulerRetryIntervalMs);
    timer.unref?.();
    this.retryTimers.set(taskId, timer);
  }
  clearRetry(taskId) {
    const timer = this.retryTimers.get(taskId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.retryTimers.delete(taskId);
  }
  handleVerificationResult(task, attemptId, agentName, result) {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }
    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }
    const normalizedStatus = this.mapResultToOutcomeStatus(result);
    this.persistenceService.recordVerificationOutcome({
      taskId: parent.taskId,
      attemptId,
      stage: "verification",
      status: normalizedStatus,
      summary: result.summary,
      details: this.buildOutcomeDetails(result),
      reviewer: agentName
    });
    this.events?.onVerificationOutcome?.(
      parent.taskId,
      "verification",
      normalizedStatus,
      result.summary,
      attemptId,
      agentName
    );
    if (result.success) {
      this.persistenceService.setTaskStatus(task.taskId, "completed");
      this.persistenceService.setTaskStatus(parent.taskId, "verified");
      this.buildAndPersistDigest(parent, result.summary ?? "verification passed", agentName);
      this.startReview(parent, result.summary);
    } else {
      this.persistenceService.setTaskStatus(task.taskId, "failed");
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_human");
      const failureArtifacts = this.persistenceService.getArtifactsForTask(task.taskId).filter((artifact) => artifact.kind === "verification_log");
      this.queueVerificationFixTask(parent, result.summary, failureArtifacts);
    }
    this.resolveParentIfReady(task);
    this.recordTopologySnapshot();
    this.schedule();
  }
  handleReviewResult(task, attemptId, agentName, result) {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }
    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }
    const normalizedStatus = this.mapResultToOutcomeStatus(result);
    this.persistenceService.recordVerificationOutcome({
      taskId: parent.taskId,
      attemptId,
      stage: "review",
      status: normalizedStatus,
      summary: result.summary,
      details: this.buildOutcomeDetails(result),
      reviewer: agentName
    });
    this.events?.onVerificationOutcome?.(
      parent.taskId,
      "review",
      normalizedStatus,
      result.summary,
      attemptId,
      agentName
    );
    if (result.success) {
      this.persistenceService.setTaskStatus(task.taskId, "completed");
      this.persistenceService.setTaskStatus(parent.taskId, "verified");
      this.buildAndPersistDigest(parent, result.summary ?? "review passed", agentName);
      if (parent.rootPath) {
        this.prAutomationService.finalizeTask(parent, parent.rootPath);
      }
      this.resolveParentIfReady(parent);
    } else {
      this.persistenceService.setTaskStatus(task.taskId, "failed");
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
    }
    this.resolveParentIfReady(task);
    this.recordTopologySnapshot();
  }
  handleArtifactVerificationResult(task, attemptId, agentName, result) {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }
    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }
    const normalizedStatus = this.mapResultToOutcomeStatus(result);
    this.persistenceService.recordVerificationOutcome({
      taskId: parent.taskId,
      attemptId,
      stage: "verification",
      status: normalizedStatus,
      summary: result.summary,
      details: this.buildOutcomeDetails(result),
      reviewer: agentName
    });
    this.events?.onVerificationOutcome?.(
      parent.taskId,
      "verification",
      normalizedStatus,
      result.summary,
      attemptId,
      agentName
    );
    if (result.success) {
      this.tasksAwaitingCritic.delete(parent.taskId);
      const artifactId = typeof task.metadata?.artifact_id === "string" ? task.metadata.artifact_id : void 0;
      if (artifactId) {
        this.artifactCriticQueue.delete(artifactId);
      }
      this.persistenceService.updateTaskMetadata(parent.taskId, {
        ...parent.metadata ?? {},
        critic_verified: (/* @__PURE__ */ new Date()).toISOString()
      });
      this.buildAndPersistDigest(parent, result.summary ?? "artifact verification passed", agentName);
      this.flushPendingCheckpoint(parent);
      this.persistenceService.setTaskStatus(parent.taskId, "queued");
    } else {
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_human");
      this.scheduleRetry(parent.taskId);
    }
    this.resolveParentIfReady(task);
    this.readyQueue.add(parent.taskId);
    this.recordTopologySnapshot();
    this.schedule();
  }
  startVerification(parent, summary) {
    if (this.hasStageDependency(parent, "verification")) {
      return;
    }
    const child = this.createStageTask(parent, "verification", "tester", "Verification pass for implementation", summary);
    this.readyQueue.add(child.taskId);
    this.persistenceService.setTaskStatus(parent.taskId, "in_review");
    this.recordTopologySnapshot();
    const refreshedParent = this.persistenceService.getTask(parent.taskId);
    if (refreshedParent) {
      this.buildAndPersistDigest(refreshedParent, summary ?? "verification requested", this.config.agentName);
    }
    this.events?.onVerificationRequested?.(
      parent.taskId,
      "verification",
      this.config.agentName,
      summary
    );
  }
  startReview(parent, summary) {
    if (this.hasStageDependency(parent, "review")) {
      return;
    }
    const child = this.createStageTask(parent, "review", "reviewer", "Human review pass", summary);
    this.readyQueue.add(child.taskId);
    this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_dependency");
    this.recordTopologySnapshot();
    const refreshedParent = this.persistenceService.getTask(parent.taskId);
    if (refreshedParent) {
      this.buildAndPersistDigest(refreshedParent, summary ?? "review requested", this.config.agentName);
    }
  }
  handleArbitrationResult(task, attemptId, agentName, result) {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }
    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }
    const normalizedStatus = this.mapResultToOutcomeStatus(result);
    this.persistenceService.recordVerificationOutcome({
      taskId: parent.taskId,
      attemptId,
      stage: "review",
      status: normalizedStatus,
      summary: result.summary,
      details: this.buildOutcomeDetails(result),
      reviewer: agentName
    });
    if (result.success) {
      this.persistenceService.setTaskStatus(task.taskId, "completed");
      this.buildAndPersistDigest(parent, result.summary ?? "arbitration complete", agentName);
    } else {
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_human");
    }
    this.resolveParentIfReady(task);
    this.recordTopologySnapshot();
    this.schedule();
  }
  handleCheckpointCompressionResult(task, attemptId, agentName, result) {
    const parentId = task.parentTaskId;
    if (!parentId) {
      return;
    }
    const parent = this.persistenceService.getTask(parentId);
    if (!parent) {
      return;
    }
    const latestDigest = this.persistenceService.getLatestTaskStateDigest(parent.taskId);
    const payload = this.buildCheckpointPayload(result);
    if (payload) {
      this.persistCheckpoint(parent.taskId, attemptId, result.summary, payload);
    }
    const compressionMetrics = {
      artifactCount: latestDigest?.artifactIndex.length ?? 0,
      planSize: latestDigest?.currentPlan.length ?? 0,
      openQuestions: latestDigest?.openQuestions.length ?? 0,
      activeRisks: latestDigest?.activeRisks.length ?? 0
    };
    const sourceDigestId = typeof task.metadata?.compression_source_digest_id === "string" ? task.metadata.compression_source_digest_id : latestDigest?.id;
    this.persistenceService.updateTaskMetadata(parent.taskId, {
      ...parent.metadata ?? {},
      last_compression_digest_id: sourceDigestId,
      last_compression_completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_compression_metrics: compressionMetrics,
      last_compression_summary: result.summary,
      last_compression_success: result.success,
      ...task.metadata?.pre_cloud_compression === true ? { last_pre_cloud_compression_completed_at: (/* @__PURE__ */ new Date()).toISOString() } : {}
    });
    if (result.success) {
      this.persistenceService.setTaskStatus(task.taskId, "completed");
      this.persistenceService.setTaskStatus(parent.taskId, "queued");
      this.buildAndPersistDigest(
        parent,
        result.summary ?? "checkpoint compression completed",
        agentName,
        typeof result.metadata?.compression === "object" && result.metadata.compression !== null && typeof result.metadata.compression.compressed_content === "string" ? result.metadata.compression.compressed_content : void 0
      );
    } else {
      this.persistenceService.setTaskStatus(task.taskId, "failed");
      this.persistenceService.setTaskStatus(parent.taskId, "queued");
    }
    this.readyQueue.add(parent.taskId);
    this.recordTopologySnapshot();
    this.schedule();
  }
  createStageTask(parent, stage, role, description, parentSummary, extraMetadata) {
    const taskId = (0, import_node_crypto.randomUUID)();
    const record = this.persistenceService.createTask({
      taskId,
      name: `${parent.name} \u2192 ${stage}`,
      priority: parent.priority,
      parentTaskId: parent.taskId,
      status: "queued",
      metadata: {
        stage,
        agent_role: role,
        task_type: stage,
        description,
        parent_summary: parentSummary,
        project_id: parent.projectId ?? this.config.projectId,
        repo_id: parent.repoId ?? this.config.repoId,
        root_path: parent.rootPath ?? this.config.projectRoot,
        branch: parent.branch ?? this.config.defaultBranch,
        ...extraMetadata
      }
    });
    this.persistenceService.addDependency(parent.taskId, record.taskId);
    return record;
  }
  hasStageDependency(parent, stage) {
    const dependents = this.persistenceService.listDependents(parent.taskId);
    for (const dependency of dependents) {
      const child = this.persistenceService.getTask(dependency.dependsOnTaskId);
      if (child?.metadata?.stage === stage) {
        return true;
      }
    }
    return false;
  }
  isSideEffectReviewTriggered(task) {
    return Boolean(task.metadata?.side_effect_review);
  }
  maybeScheduleCheckpointCompression(task) {
    if (typeof task.metadata?.stage === "string" && task.metadata.stage === "checkpoint_compression") {
      return false;
    }
    if (this.hasStageDependency(task, "checkpoint_compression")) {
      return false;
    }
    const digest = this.persistenceService.getLatestTaskStateDigest(task.taskId);
    if (!digest || !this.needsCheckpointCompression(task, digest)) {
      return false;
    }
    if (typeof task.metadata?.last_compression_completed_at === "string" && digest.droidspeak?.kind === "summary_emitted") {
      return false;
    }
    const child = this.createStageTask(
      task,
      "checkpoint_compression",
      "checkpoint-compressor",
      `Compress checkpoint state for ${task.name}`,
      digest.objective,
      {
        canonical_role: "checkpoint-compressor",
        compression_source_digest_id: digest.id
      }
    );
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...task.metadata ?? {},
      last_compression_requested_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_compression_requested_digest_id: digest.id
    });
    this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
    this.readyQueue.add(child.taskId);
    return true;
  }
  maybeSchedulePreCloudCompression(task, routingDecision) {
    if (!routingDecision.cloudEscalated) {
      return false;
    }
    if (typeof task.metadata?.stage === "string" && task.metadata.stage === "checkpoint_compression") {
      return false;
    }
    if (this.hasStageDependency(task, "checkpoint_compression")) {
      return false;
    }
    const digest = this.persistenceService.getLatestTaskStateDigest(task.taskId);
    const description = typeof task.metadata?.description === "string" ? task.metadata.description.toLowerCase() : "";
    const digestSignals = (digest?.artifactIndex.length ?? 0) + (digest?.currentPlan.length ?? 0) + (digest?.openQuestions.length ?? 0);
    if (digestSignals < 6 && !/(large|multi-file|migration|refactor|codebase)/.test(description)) {
      return false;
    }
    const signature = [
      routingDecision.routeKind ?? "cloud-escalated",
      routingDecision.escalationReason ?? "cloud",
      digest?.id ?? "no-digest"
    ].join(":");
    if (task.metadata?.last_pre_cloud_compression_signature === signature) {
      return false;
    }
    const child = this.createStageTask(
      task,
      "checkpoint_compression",
      "checkpoint-compressor",
      `Compress local context before cloud escalation for ${task.name}`,
      digest?.objective,
      {
        canonical_role: "checkpoint-compressor",
        compression_source_digest_id: digest?.id,
        pre_cloud_compression: true,
        pre_cloud_route_kind: routingDecision.routeKind,
        pre_cloud_escalation_reason: routingDecision.escalationReason
      }
    );
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...task.metadata ?? {},
      last_pre_cloud_compression_signature: signature,
      last_pre_cloud_compression_requested_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
    this.readyQueue.add(child.taskId);
    return true;
  }
  expandParallelRequests(task, requests) {
    const digest = this.persistenceService.getLatestTaskStateDigest(task.taskId);
    const policy = this.resolveTaskPolicy(task);
    const grouped = /* @__PURE__ */ new Map();
    for (const request of requests) {
      const canonicalRole = (0, import_shared_routing.normalizeSwarmRole)(request.role);
      const existing = grouped.get(canonicalRole) ?? [];
      existing.push(request);
      grouped.set(canonicalRole, existing);
    }
    const expanded = [];
    for (const [canonicalRole, group] of grouped.entries()) {
      const definition = (0, import_shared_routing.getSwarmRoleDefinition)(canonicalRole);
      const desiredCount = definition.allowParallelInstances ? this.desiredParallelCount(task, canonicalRole, digest) : 1;
      const cappedBySameRole = policy.maxSameRoleHelpers != null ? Math.min(desiredCount, policy.maxSameRoleHelpers) : desiredCount;
      const effectiveCount = Math.max(1, Math.min(group.length > 0 ? group.length : 1, cappedBySameRole));
      const totalCount = group.length === 1 ? desiredCount : effectiveCount;
      const cappedTotalCount = policy.maxSameRoleHelpers != null ? Math.min(totalCount, policy.maxSameRoleHelpers) : totalCount;
      const parallelGroupId = cappedTotalCount > 1 ? (0, import_node_crypto.randomUUID)() : void 0;
      for (let index = 0; index < cappedTotalCount; index += 1) {
        const template = group[Math.min(index, group.length - 1)];
        expanded.push({
          role: template.role,
          reason: cappedTotalCount > 1 ? `${template.reason} [parallel ${index + 1}/${cappedTotalCount}]` : template.reason,
          instructions: cappedTotalCount > 1 ? `${template.instructions}

Parallel focus ${index + 1}/${cappedTotalCount}: produce an independent ${canonicalRole} output and avoid copying sibling reasoning.` : template.instructions,
          canonicalRole,
          parallelGroupId,
          parallelIndex: parallelGroupId ? index + 1 : void 0,
          parallelTotal: parallelGroupId ? cappedTotalCount : void 0
        });
      }
    }
    const maxParallelHelpers = policy.maxParallelHelpers ?? this.config.schedulerMaxFanOut;
    return expanded.slice(0, Math.max(1, Math.min(this.config.schedulerMaxFanOut, maxParallelHelpers)));
  }
  maybeScheduleBottleneckFanout(task) {
    const digest = this.persistenceService.getLatestTaskStateDigest(task.taskId);
    if (!digest) {
      return false;
    }
    if (typeof task.metadata?.stage === "string") {
      return false;
    }
    const lastCompressionCompletedAt = typeof task.metadata?.last_compression_completed_at === "string" ? Date.parse(task.metadata.last_compression_completed_at) : Number.NaN;
    const digestTimestamp = Date.parse(digest.ts);
    if (Number.isFinite(lastCompressionCompletedAt) && (!Number.isFinite(digestTimestamp) || digestTimestamp <= lastCompressionCompletedAt)) {
      return false;
    }
    const requests = [];
    const signatures = [];
    const policy = this.resolveTaskPolicy(task);
    const maxParallel = policy.maxParallelHelpers ?? this.config.schedulerMaxFanOut;
    const activeRisks = digest.activeRisks.length;
    const openQuestions = digest.openQuestions.length;
    const artifactCount = digest.artifactIndex.length;
    const description = typeof task.metadata?.description === "string" ? task.metadata.description.toLowerCase() : "";
    if (openQuestions >= 3 && !this.hasPendingChildRole(task, "researcher")) {
      requests.push({
        role: "researcher",
        reason: "open questions bottleneck",
        instructions: `Resolve the highest-value unanswered questions blocking ${task.name}.`
      });
      signatures.push(`researcher:${openQuestions}`);
    }
    if ((artifactCount <= 1 || /(repo|codebase|workspace|monorepo|scan)/.test(description)) && !this.hasPendingChildRole(task, "repo-scanner")) {
      requests.push({
        role: "repo-scanner",
        reason: "repo uncertainty bottleneck",
        instructions: `Scan the repository and summarize the most relevant code areas for ${task.name}.`
      });
      signatures.push(`repo-scanner:${artifactCount}`);
    }
    if (activeRisks >= 2 && !this.hasPendingChildRole(task, "reviewer")) {
      requests.push({
        role: "reviewer",
        reason: "risk bottleneck",
        instructions: `Review the current plan and identify the highest-risk paths, tradeoffs, and required mitigations for ${task.name}.`
      });
      signatures.push(`reviewer:${activeRisks}`);
    }
    if (requests.length === 0) {
      return false;
    }
    const signature = signatures.sort().join("|");
    if (task.metadata?.last_allocator_signature === signature) {
      return false;
    }
    const created = this.createChildTasks(
      task,
      requests.slice(0, maxParallel),
      digest.objective,
      digest.droidspeak?.compact
    );
    if (!created) {
      return false;
    }
    this.persistenceService.updateTaskMetadata(task.taskId, {
      ...task.metadata ?? {},
      last_allocator_signature: signature,
      last_allocator_triggered_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
    this.buildAndPersistDigest(task, `Allocator fanout created for ${requests.map((request) => request.role).join(", ")}`, this.config.agentName);
    return true;
  }
  desiredParallelCount(task, canonicalRole, digest) {
    const openQuestions = digest?.openQuestions.length ?? 0;
    const activeRisks = digest?.activeRisks.length ?? 0;
    const artifactCount = digest?.artifactIndex.length ?? 0;
    const planSize = digest?.currentPlan.length ?? 0;
    const description = typeof task.metadata?.description === "string" ? task.metadata.description.toLowerCase() : "";
    switch (canonicalRole) {
      case "researcher":
        return openQuestions >= 6 ? 3 : openQuestions >= 3 ? 2 : 1;
      case "repo-scanner":
        if (artifactCount >= 8 || /(monorepo|workspace|packages|large repo)/.test(description)) {
          return 3;
        }
        return artifactCount >= 4 || /(repo|scan|codebase)/.test(description) ? 2 : 1;
      case "reviewer":
        return activeRisks >= 2 || task.priority === "high" || task.priority === "urgent" ? 2 : 1;
      case "summarizer":
      case "checkpoint-compressor":
        return artifactCount >= 6 || planSize >= 5 || openQuestions >= 4 ? 2 : 1;
      default:
        return 1;
    }
  }
  needsCheckpointCompression(task, digest) {
    const artifactCount = digest.artifactIndex.length;
    const planSize = digest.currentPlan.length;
    const openQuestions = digest.openQuestions.length;
    const activeRisks = digest.activeRisks.length;
    const thresholdReached = artifactCount >= 6 || planSize >= 5 || openQuestions >= 4 || artifactCount + planSize + openQuestions + activeRisks >= 12;
    if (!thresholdReached) {
      return false;
    }
    const lastCompressionMetrics = typeof task.metadata?.last_compression_metrics === "object" && task.metadata.last_compression_metrics !== null ? task.metadata.last_compression_metrics : void 0;
    if (!lastCompressionMetrics) {
      return true;
    }
    const lastArtifactCount = typeof lastCompressionMetrics.artifactCount === "number" ? lastCompressionMetrics.artifactCount : 0;
    const lastPlanSize = typeof lastCompressionMetrics.planSize === "number" ? lastCompressionMetrics.planSize : 0;
    const lastOpenQuestions = typeof lastCompressionMetrics.openQuestions === "number" ? lastCompressionMetrics.openQuestions : 0;
    const lastActiveRisks = typeof lastCompressionMetrics.activeRisks === "number" ? lastCompressionMetrics.activeRisks : 0;
    return artifactCount >= lastArtifactCount + 2 || planSize >= lastPlanSize + 2 || openQuestions >= lastOpenQuestions + 1 || activeRisks >= lastActiveRisks + 1;
  }
  maybeCollapseParallelGroup(task, result) {
    const parallelGroup = typeof task.metadata?.parallel_group === "string" ? task.metadata.parallel_group : void 0;
    if (!parallelGroup || !result.success) {
      return;
    }
    const canonicalRole = typeof task.metadata?.canonical_role === "string" ? task.metadata.canonical_role : (0, import_shared_routing.normalizeSwarmRole)(typeof task.metadata?.agent_role === "string" ? task.metadata.agent_role : "implementation-helper");
    if (!(0, import_shared_routing.getSwarmRoleDefinition)(canonicalRole).allowParallelInstances) {
      return;
    }
    if (canonicalRole === "reviewer" || canonicalRole === "verifier") {
      return;
    }
    const siblings = this.getParallelGroupTasks(task.parentTaskId, parallelGroup).filter((sibling) => sibling.taskId !== task.taskId);
    const hasRecordedFailure = siblings.some((sibling) => sibling.metadata?.last_outcome_success === false);
    if (hasRecordedFailure) {
      return;
    }
    for (const sibling of siblings) {
      if (sibling.status !== "queued" && sibling.status !== "planning" && sibling.status !== "running") {
        continue;
      }
      this.supervisor.cancelTask(sibling.taskId);
      this.persistenceService.setTaskStatus(sibling.taskId, "cancelled");
      this.persistenceService.updateTaskMetadata(sibling.taskId, {
        ...sibling.metadata ?? {},
        parallel_resolution: "accepted_fastest_verified_result",
        resolved_by_task_id: task.taskId
      });
    }
  }
  maybeStartArbitration(parent, dependencies) {
    const groups = /* @__PURE__ */ new Map();
    for (const dependency of dependencies) {
      const parallelGroup = typeof dependency.metadata?.parallel_group === "string" ? dependency.metadata.parallel_group : void 0;
      if (!parallelGroup) {
        continue;
      }
      const existing = groups.get(parallelGroup) ?? [];
      existing.push(dependency);
      groups.set(parallelGroup, existing);
    }
    for (const [parallelGroup, group] of groups.entries()) {
      if (group.length < 2) {
        continue;
      }
      const canonicalRole = typeof group[0]?.metadata?.canonical_role === "string" ? group[0].metadata.canonical_role : (0, import_shared_routing.normalizeSwarmRole)(typeof group[0]?.metadata?.agent_role === "string" ? group[0].metadata.agent_role : "implementation-helper");
      if (!group.every((dependency) => typeof dependency.metadata?.last_outcome_success === "boolean")) {
        continue;
      }
      if (!this.parallelGroupNeedsArbiter(canonicalRole, group)) {
        continue;
      }
      if (this.hasStageDependency(parent, "arbitration")) {
        return true;
      }
      const summaries = group.map((dependency) => typeof dependency.metadata?.last_outcome_summary === "string" ? dependency.metadata.last_outcome_summary : dependency.name).join(" | ");
      const arbiter = this.createStageTask(
        parent,
        "arbitration",
        "arbiter",
        `Resolve disagreement for ${canonicalRole} outputs`,
        summaries,
        {
          parallel_group: parallelGroup,
          canonical_role: "arbiter",
          arbitration_role: canonicalRole,
          arbitration_children: group.map((dependency) => dependency.taskId)
        }
      );
      this.readyQueue.add(arbiter.taskId);
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_dependency");
      this.recordTopologySnapshot();
      return true;
    }
    return false;
  }
  getParallelGroupTasks(parentTaskId, parallelGroup) {
    if (!parentTaskId) {
      return [];
    }
    return this.persistenceService.listDependencies(parentTaskId).map((dependency) => this.persistenceService.getTask(dependency.dependsOnTaskId)).filter((task) => Boolean(task)).filter((task) => task.metadata?.parallel_group === parallelGroup);
  }
  parallelGroupNeedsArbiter(canonicalRole, group) {
    if (canonicalRole !== "reviewer" && canonicalRole !== "verifier") {
      return false;
    }
    const outcomeFlags = new Set(group.map((task) => task.metadata?.last_outcome_success));
    if (outcomeFlags.size > 1) {
      return true;
    }
    const reasons = new Set(
      group.map((task) => typeof task.metadata?.last_outcome_reason === "string" ? task.metadata.last_outcome_reason : void 0).filter((reason) => Boolean(reason))
    );
    return reasons.size > 1;
  }
  selectModelForTask(task, role) {
    const metadataModel = typeof task.metadata?.agent_model === "string" ? task.metadata.agent_model : void 0;
    if (metadataModel) {
      return metadataModel;
    }
    const stage = typeof task.metadata?.stage === "string" ? task.metadata.stage : void 0;
    if (stage === "verification" || stage === "review") {
      return this.config.modelRouting.verification;
    }
    const normalizedTaskType = typeof task.metadata?.task_type === "string" ? task.metadata.task_type.toLowerCase() : "";
    if (this.isCodeRole(role) || normalizedTaskType.includes("code") || normalizedTaskType.includes("implementation") || normalizedTaskType.includes("dev") || normalizedTaskType.includes("coder")) {
      return this.config.modelRouting.code;
    }
    if (normalizedTaskType.includes("plan") || role.toLowerCase().includes("plan")) {
      return this.config.modelRouting.planning;
    }
    return this.config.modelRouting.default;
  }
  parseCheckpointPayload(checkpoint) {
    try {
      return JSON.parse(checkpoint.payloadJson);
    } catch {
      return void 0;
    }
  }
  isCodeRole(role) {
    const normalized = role.toLowerCase();
    return normalized.includes("code") || normalized.includes("coder") || normalized.includes("dev");
  }
  buildAndPersistDigest(task, summary, updatedBy, compact) {
    const artifacts = this.persistenceService.getArtifactsForTask(task.taskId);
    const artifactMemory = this.persistenceService.listArtifactMemory(task.taskId);
    const digest = (0, import_coordination.buildTaskDigest)({
      task,
      summary,
      artifacts: artifactMemory.length > 0 ? artifactMemory.map((entry) => ({
        artifactId: entry.artifactId,
        attemptId: "",
        taskId: entry.taskId,
        runId: entry.runId,
        projectId: entry.projectId,
        kind: entry.kind,
        summary: entry.shortSummary,
        content: entry.reasonRelevant,
        metadata: {
          reasonRelevant: entry.reasonRelevant,
          trustConfidence: entry.trustConfidence,
          sourceTaskId: entry.sourceTaskId,
          supersededBy: entry.supersededBy
        },
        createdAt: entry.updatedAt
      })) : artifacts,
      lastUpdatedBy: updatedBy,
      openQuestions: typeof task.metadata?.clarification_question === "string" ? [task.metadata.clarification_question] : [],
      activeRisks: typeof task.metadata?.blocked_reason === "string" ? [task.metadata.blocked_reason] : [],
      decisions: typeof task.metadata?.agent_reason === "string" ? [task.metadata.agent_reason] : [],
      verificationState: task.status,
      droidspeak: compact ? (0, import_coordination.buildDroidspeakV2)("summary_emitted", summary, compact) : (0, import_coordination.buildDroidspeakV2)(task.status === "waiting_on_dependency" || task.status === "waiting_on_human" ? "blocked" : "plan_status", summary)
    });
    digest.artifactIndex = digest.artifactIndex.map((artifact) => {
      const indexed = artifactMemory.find((entry) => entry.artifactId === artifact.artifactId);
      return indexed ? {
        ...artifact,
        reasonRelevant: indexed.reasonRelevant,
        trustConfidence: indexed.trustConfidence,
        sourceTaskId: indexed.sourceTaskId,
        supersededBy: indexed.supersededBy
      } : artifact;
    });
    this.persistenceService.recordTaskStateDigest(digest);
    this.persistenceService.recordExecutionEvent("memory_pinned", `Task digest updated for ${task.taskId}`, {
      taskId: task.taskId,
      digestId: digest.id,
      digestHash: digest.federationHash,
      auditHash: digest.auditHash,
      verificationState: digest.verificationState
    }, {
      taskId: task.taskId,
      normalizedVerb: "memory.pinned",
      transportBody: {
        digestId: digest.id,
        digestHash: digest.federationHash,
        auditHash: digest.auditHash,
        verificationState: digest.verificationState,
        droidspeak: digest.droidspeak
      }
    });
    return digest;
  }
  recordBudgetLimit(taskId, detail, consumed) {
    this.persistenceService.recordBudgetEvent(taskId, detail, consumed);
  }
  enforceBudgetLimit(task) {
    const limit = this.config.budgetMaxConsumed;
    if (limit == null) {
      return true;
    }
    if (this.budgetLimitReached) {
      return false;
    }
    const consumed = this.persistenceService.getRunBudgetConsumed();
    if (consumed >= limit) {
      this.recordBudgetLimit(task.taskId, `Run budget limit (${limit}) reached (${consumed})`, consumed);
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      this.budgetLimitReached = true;
      return false;
    }
    return true;
  }
  checkSideEffectBudget(task) {
    if (this.config.sideEffectActionsBeforeReview <= 0) {
      return true;
    }
    const sideEffectArtifacts = this.persistenceService.getArtifactsForTask(task.taskId).filter((artifact) => artifact.kind === "side_effect").length;
    if (sideEffectArtifacts >= this.config.sideEffectActionsBeforeReview) {
      this.recordBudgetLimit(
        task.taskId,
        `Side-effect action limit (${this.config.sideEffectActionsBeforeReview}) reached`,
        sideEffectArtifacts
      );
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      return false;
    }
    return true;
  }
  getTaskPolicy(task) {
    const rawPolicy = task.metadata?.policy;
    if (!rawPolicy || typeof rawPolicy !== "object") {
      return {};
    }
    const policyRecord = rawPolicy;
    return {
      maxDepth: this.toPositiveNumber(policyRecord.max_depth ?? policyRecord.maxDepth),
      maxChildren: this.toPositiveNumber(policyRecord.max_children ?? policyRecord.maxChildren),
      maxTokens: this.toPositiveNumber(policyRecord.max_tokens ?? policyRecord.maxTokens),
      maxToolCalls: this.toPositiveNumber(policyRecord.max_tool_calls ?? policyRecord.maxToolCalls),
      timeoutMs: this.toPositiveNumber(policyRecord.timeout_ms ?? policyRecord.timeoutMs),
      maxParallelHelpers: this.toPositiveNumber(policyRecord.max_parallel_helpers ?? policyRecord.maxParallelHelpers),
      maxSameRoleHelpers: this.toPositiveNumber(policyRecord.max_same_role_helpers ?? policyRecord.maxSameRoleHelpers),
      localQueueTolerance: this.toPositiveNumber(policyRecord.local_queue_tolerance ?? policyRecord.localQueueTolerance),
      allowedTools: Array.isArray(policyRecord.allowed_tools) ? policyRecord.allowed_tools.filter((value) => typeof value === "string") : void 0,
      approvalPolicy: typeof policyRecord.approval_policy === "string" && ["auto", "manual"].includes(policyRecord.approval_policy) ? policyRecord.approval_policy : void 0,
      cloudEscalationAllowed: typeof policyRecord.cloud_escalation_allowed === "boolean" ? policyRecord.cloud_escalation_allowed : typeof policyRecord.cloudEscalationAllowed === "boolean" ? policyRecord.cloudEscalationAllowed : void 0,
      priorityBias: typeof policyRecord.priority_bias === "string" && ["time", "cost", "balanced"].includes(policyRecord.priority_bias) ? policyRecord.priority_bias : typeof policyRecord.priorityBias === "string" && ["time", "cost", "balanced"].includes(policyRecord.priorityBias) ? policyRecord.priorityBias : void 0
    };
  }
  resolveTaskPolicy(task) {
    const overrides = this.getTaskPolicy(task);
    const defaults = this.config.policyDefaults ?? {};
    const allowedTools = overrides.allowedTools ?? defaults.allowedTools;
    return {
      maxDepth: overrides.maxDepth ?? defaults.maxDepth,
      maxChildren: overrides.maxChildren ?? defaults.maxChildren,
      maxTokens: overrides.maxTokens ?? defaults.maxTokens,
      maxToolCalls: overrides.maxToolCalls ?? defaults.maxToolCalls,
      timeoutMs: overrides.timeoutMs ?? defaults.timeoutMs,
      maxParallelHelpers: overrides.maxParallelHelpers ?? defaults.maxParallelHelpers,
      maxSameRoleHelpers: overrides.maxSameRoleHelpers ?? defaults.maxSameRoleHelpers,
      localQueueTolerance: overrides.localQueueTolerance ?? defaults.localQueueTolerance,
      allowedTools: allowedTools ? [...allowedTools] : void 0,
      approvalPolicy: overrides.approvalPolicy ?? defaults.approvalPolicy,
      cloudEscalationAllowed: overrides.cloudEscalationAllowed ?? defaults.cloudEscalationAllowed,
      priorityBias: overrides.priorityBias ?? defaults.priorityBias
    };
  }
  toPositiveNumber(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return void 0;
  }
  getPolicyChildCount(task) {
    return this.persistenceService.listDependents(task.taskId).length;
  }
  enforceTaskPolicy(task, requests) {
    const policy = this.resolveTaskPolicy(task);
    if (policy.maxDepth != null) {
      const depth = this.getTaskDepth(task.taskId);
      if (depth >= policy.maxDepth) {
        this.recordPolicyViolation(
          task,
          `Task depth ${depth} meets policy max depth ${policy.maxDepth}`,
          depth
        );
        return false;
      }
    }
    const childCount = this.getPolicyChildCount(task);
    if (policy.maxChildren != null && childCount + requests.length > policy.maxChildren) {
      this.recordPolicyViolation(
        task,
        `Policy max children ${policy.maxChildren} exceeded (${childCount} existing + ${requests.length} new)`,
        childCount + requests.length
      );
      return false;
    }
    if (policy.approvalPolicy === "manual" && requests.length > 0) {
      this.recordPolicyViolation(
        task,
        "Manual approval policy requires human review before spawning assistants",
        requests.length
      );
      return false;
    }
    return true;
  }
  applyUsageConstraints(task, attemptId, result) {
    const policy = this.resolveTaskPolicy(task);
    const metrics = {
      tokens: (result.budget.tokensIn ?? 0) + (result.budget.tokensOut ?? 0),
      tool_calls: result.activity.toolCalls.length,
      tools: result.activity.toolCalls.map((toolCall) => toolCall.tool)
    };
    const existingUsage = task.metadata?.usage ?? {};
    let tokensTotal = existingUsage.tokens ?? 0;
    let toolCallsTotal = existingUsage.tool_calls ?? 0;
    if (metrics?.tokens != null) {
      tokensTotal += metrics.tokens;
    }
    if (metrics?.tool_calls != null) {
      toolCallsTotal += metrics.tool_calls;
    }
    const shouldPersistUsage = Boolean(metrics?.tokens != null || metrics?.tool_calls != null);
    const usageUpdates = {};
    if (shouldPersistUsage) {
      usageUpdates.usage = {
        ...existingUsage,
        tokens: tokensTotal,
        tool_calls: toolCallsTotal
      };
    }
    const persistUsage = () => {
      if (!shouldPersistUsage) {
        return;
      }
      this.persistenceService.updateTaskMetadata(task.taskId, {
        ...task.metadata ?? {},
        ...usageUpdates
      });
    };
    if (policy.maxTokens != null && tokensTotal > policy.maxTokens) {
      persistUsage();
      this.recordPolicyViolation(
        task,
        `Policy max tokens ${policy.maxTokens} exceeded (${tokensTotal})`,
        tokensTotal
      );
      return false;
    }
    if (policy.maxToolCalls != null && toolCallsTotal > policy.maxToolCalls) {
      persistUsage();
      this.recordPolicyViolation(
        task,
        `Policy max tool calls ${policy.maxToolCalls} exceeded (${toolCallsTotal})`,
        toolCallsTotal
      );
      return false;
    }
    if (policy.allowedTools && policy.allowedTools.length > 0 && Array.isArray(metrics?.tools)) {
      const disallowed = metrics.tools.filter((tool) => !policy.allowedTools.includes(tool));
      if (disallowed.length > 0) {
        persistUsage();
        this.recordPolicyViolation(
          task,
          `Tool usage forbidden by policy (${disallowed.join(", ")})`,
          disallowed.length
        );
        return false;
      }
    }
    if (policy.timeoutMs != null) {
      const attempt = this.persistenceService.getAttempt(attemptId);
      if (attempt) {
        const elapsedMs = Date.now() - new Date(attempt.createdAt).getTime();
        if (elapsedMs > policy.timeoutMs) {
          persistUsage();
          this.recordPolicyViolation(
            task,
            `Task exceeded timeout ${policy.timeoutMs}ms (${Math.round(elapsedMs)}ms)`,
            elapsedMs
          );
          return false;
        }
      }
    }
    if (shouldPersistUsage) {
      persistUsage();
    }
    return true;
  }
  mapResultToOutcomeStatus(result) {
    if (result.success) {
      return "passed";
    }
    if (result.timedOut || this.getReasonCode(result)) {
      return "blocked";
    }
    return "failed";
  }
  buildOutcomeDetails(result) {
    const fragments = [];
    if (this.getReasonCode(result)) {
      fragments.push(this.getReasonCode(result) ?? "");
    }
    const clarification = this.getClarificationQuestion(result);
    if (clarification) {
      fragments.push(`clarification: ${clarification}`);
    }
    return fragments.length > 0 ? fragments.join(" | ") : void 0;
  }
  getCompression(result) {
    return this.getCompressionPayload(result)?.compressed_content;
  }
  getCompressionPayload(result) {
    const compression = result.metadata?.compression;
    if (typeof compression === "object" && compression !== null && typeof compression.compressed_content === "string") {
      return {
        compressed_content: compression.compressed_content
      };
    }
    if (!result.summary) {
      return void 0;
    }
    return {
      compressed_content: result.summary
    };
  }
  getReasonCode(result) {
    return typeof result.metadata?.reasonCode === "string" ? result.metadata.reasonCode : void 0;
  }
  getClarificationQuestion(result) {
    if (typeof result.metadata?.clarificationQuestion === "string") {
      return result.metadata.clarificationQuestion;
    }
    return result.checkpointDelta.openQuestions[0];
  }
  recordPolicyViolation(task, detail, consumed) {
    this.recordBudgetLimit(task.taskId, detail, consumed);
    this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
  }
  hasPendingChildRole(parent, role) {
    return this.persistenceService.listDependents(parent.taskId).map((dependency) => this.persistenceService.getTask(dependency.dependsOnTaskId)).filter((task) => Boolean(task)).some((task) => {
      const taskRole = typeof task.metadata?.canonical_role === "string" ? task.metadata.canonical_role : (0, import_shared_routing.normalizeSwarmRole)(typeof task.metadata?.agent_role === "string" ? task.metadata.agent_role : "");
      return taskRole === (0, import_shared_routing.normalizeSwarmRole)(role) && !terminalTaskStatuses.includes(task.status);
    });
  }
  recordTopologySnapshot() {
    this.persistenceService.recordSwarmTopologySnapshot();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TaskScheduler
});
