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
var import_AgentSupervisor = require("../AgentSupervisor");
const buildTaskRecord = (task) => ({
  taskId: task.taskId,
  title: task.name,
  description: typeof task.metadata?.description === "string" ? task.metadata.description : "",
  taskType: typeof task.metadata?.task_type === "string" ? task.metadata.task_type : "task",
  priority: task.priority,
  createdAt: task.createdAt,
  createdByUserId: typeof task.metadata?.created_by === "string" ? task.metadata.created_by : void 0,
  branchName: typeof task.metadata?.branch_name === "string" ? task.metadata.branch_name : void 0
});
const dependencySatisfiedStatuses = ["completed", "verified", "failed", "cancelled"];
class TaskScheduler {
  constructor(persistenceService, supervisor, config) {
    this.persistenceService = persistenceService;
    this.supervisor = supervisor;
    this.config = config;
    this.readyQueue = /* @__PURE__ */ new Set();
    this.retryTimers = /* @__PURE__ */ new Map();
  }
  setEvents(events) {
    this.events = events;
  }
  handleNewTask(taskId) {
    this.readyQueue.add(taskId);
    this.schedule();
  }
  handleAgentResult(taskId, attemptId, agentName, role, result) {
    const task = this.persistenceService.getTask(taskId);
    if (!task) {
      return;
    }
    this.clearRetry(task.taskId);
    if (!this.applyUsageConstraints(task, attemptId, result)) {
      this.schedule();
      return;
    }
    const attemptStatus = result.status === "completed" ? "completed" : "failed";
    this.persistenceService.updateAttemptStatus(attemptId, attemptStatus, {
      reason_code: result.reason_code,
      summary: result.summary
    });
    const stage = typeof task.metadata?.stage === "string" ? task.metadata.stage : void 0;
    if (stage === "verification") {
      this.handleVerificationResult(task, attemptId, agentName, result);
      return;
    }
    if (stage === "review") {
      this.handleReviewResult(task, attemptId, agentName, result);
      return;
    }
    const limitedRequests = result.requested_agents.slice(0, this.config.schedulerMaxFanOut);
    if (limitedRequests.length > 0) {
      const created = this.createChildTasks(
        task,
        limitedRequests,
        result.summary,
        result.compression?.compressed_content
      );
      if (created) {
        this.persistenceService.setTaskStatus(task.taskId, "waiting_on_dependency");
      }
      if (limitedRequests.length < result.requested_agents.length) {
        this.log(
          `truncated ${result.requested_agents.length - limitedRequests.length} requested agents for ${taskId}`
        );
      }
    } else if (result.status === "completed") {
      this.persistenceService.setTaskStatus(taskId, "in_review");
      this.startVerification(task, result.summary);
    } else {
      this.persistenceService.setTaskStatus(taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
    }
    if (result.compression?.compressed_content) {
      const checkpointId = this.persistenceService.recordCheckpoint(
        taskId,
        attemptId,
        {
          compression: result.compression,
          summary: result.summary
        }
      );
      this.events?.onCheckpointCreated?.(
        taskId,
        checkpointId,
        result.summary,
        {
          compression: result.compression
        }
      );
    }
    this.resolveParentIfReady(task);
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
    if (!this.areDependenciesSatisfied(dependencies)) {
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
  areDependenciesSatisfied(dependencies) {
    for (const dependency of dependencies) {
      const candidate = this.persistenceService.getTask(dependency.dependsOnTaskId);
      if (!candidate || !dependencySatisfiedStatuses.includes(candidate.status)) {
        return false;
      }
    }
    return true;
  }
  launch(task) {
    const record = buildTaskRecord(task);
    const metadata = task.metadata ?? {};
    const checkpoint = this.persistenceService.getLatestCheckpoint(task.taskId);
    const checkpointPayload = checkpoint ? this.parseCheckpointPayload(checkpoint) : void 0;
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
    const attemptId = (0, import_node_crypto.randomUUID)();
    const spawned = this.supervisor.startAgentForTask(record, role, attemptId, parentSummary, parentDroidspeak);
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
        parent_droidspeak: parentDroidspeak
      }
    );
    this.persistenceService.recordAssignment(spawned.agentName, attemptId);
    this.persistenceService.setTaskStatus(task.taskId, "running");
  }
  createChildTasks(task, requests, parentSummary, parentDroidspeak) {
    const taskDepth = this.getTaskDepth(task.taskId);
    const childIds = [];
    if (taskDepth + 1 > this.config.schedulerMaxTaskDepth) {
      this.log(`max depth ${this.config.schedulerMaxTaskDepth} reached for ${task.taskId}; waiting on human`);
      this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
      return false;
    }
    if (!this.enforceTaskPolicy(task, requests)) {
      return false;
    }
    for (const request of requests) {
      const childId = (0, import_node_crypto.randomUUID)();
      this.persistenceService.createTask({
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
          parent_summary: parentSummary,
          parent_droidspeak: parentDroidspeak
        }
      });
      this.persistenceService.addDependency(task.taskId, childId);
      this.readyQueue.add(childId);
      childIds.push(childId);
    }
    const planSummary = requests.map((request) => `${request.role}: ${request.reason}`).join(" | ") || task.name;
    if (childIds.length > 0) {
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
  resolveParentIfReady(task) {
    if (!task.parentTaskId) {
      return;
    }
    const parent = this.persistenceService.getTask(task.parentTaskId);
    if (!parent || parent.status !== "waiting_on_dependency") {
      return;
    }
    const dependencies = this.persistenceService.listDependencies(parent.taskId);
    const incomplete = dependencies.some((dependency) => {
      const child = this.persistenceService.getTask(dependency.dependsOnTaskId);
      return !child || !dependencySatisfiedStatuses.includes(child.status);
    });
    if (!incomplete) {
      this.persistenceService.setTaskStatus(parent.taskId, "completed");
    }
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
    const normalizedStatus = this.mapResultToOutcomeStatus(result.status);
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
    if (result.status === "completed") {
      this.persistenceService.setTaskStatus(task.taskId, "completed");
      this.persistenceService.setTaskStatus(parent.taskId, "verified");
      this.startReview(parent, result.summary);
    } else {
      this.persistenceService.setTaskStatus(task.taskId, "failed");
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
    }
    this.resolveParentIfReady(task);
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
    const normalizedStatus = this.mapResultToOutcomeStatus(result.status);
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
    if (result.status === "completed") {
      this.persistenceService.setTaskStatus(task.taskId, "completed");
      this.persistenceService.setTaskStatus(parent.taskId, "verified");
    } else {
      this.persistenceService.setTaskStatus(task.taskId, "failed");
      this.persistenceService.setTaskStatus(parent.taskId, "waiting_on_human");
      this.scheduleRetry(task.taskId);
    }
    this.resolveParentIfReady(task);
  }
  startVerification(parent, summary) {
    if (this.hasStageDependency(parent, "verification")) {
      return;
    }
    const child = this.createStageTask(parent, "verification", "tester", "Verification pass for implementation", summary);
    this.readyQueue.add(child.taskId);
    this.persistenceService.setTaskStatus(parent.taskId, "in_review");
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
  }
  createStageTask(parent, stage, role, description, parentSummary) {
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
        parent_summary: parentSummary
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
  recordBudgetLimit(taskId, detail, consumed) {
    this.persistenceService.recordBudgetEvent(taskId, detail, consumed);
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
      allowedTools: Array.isArray(policyRecord.allowed_tools) ? policyRecord.allowed_tools.filter((value) => typeof value === "string") : void 0,
      approvalPolicy: typeof policyRecord.approval_policy === "string" && ["auto", "manual"].includes(policyRecord.approval_policy) ? policyRecord.approval_policy : void 0
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
    const policy = this.getTaskPolicy(task);
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
    const policy = this.getTaskPolicy(task);
    const metrics = result.metrics;
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
  mapResultToOutcomeStatus(status) {
    if (status === "completed") {
      return "passed";
    }
    if (status === "blocked") {
      return "blocked";
    }
    return "failed";
  }
  buildOutcomeDetails(result) {
    const fragments = [];
    if (result.reason_code) {
      fragments.push(result.reason_code);
    }
    if (result.clarification_question) {
      fragments.push(`clarification: ${result.clarification_question}`);
    }
    return fragments.length > 0 ? fragments.join(" | ") : void 0;
  }
  recordPolicyViolation(task, detail, consumed) {
    this.recordBudgetLimit(task.taskId, detail, consumed);
    this.persistenceService.setTaskStatus(task.taskId, "waiting_on_human");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TaskScheduler
});
