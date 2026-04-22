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
var OrchestratorEngine_exports = {};
__export(OrchestratorEngine_exports, {
  OrchestratorEngine: () => OrchestratorEngine
});
module.exports = __toCommonJS(OrchestratorEngine_exports);
var import_messages = require("../messages");
class OrchestratorEngine {
  constructor(deps) {
    this.deps = deps;
    this.attemptMap = /* @__PURE__ */ new Map();
    this.onPlanProposed = (taskId, planId, summary, plan, dependencies) => {
      this.deps.persistenceService.recordExecutionEvent("plan_proposed", summary, {
        taskId,
        planId,
        dependencies
      }, {
        taskId,
        normalizedVerb: "plan.proposed",
        transportBody: {
          taskId,
          planId,
          summary,
          plan,
          dependencies
        }
      });
      this.deps.gateway.send((0, import_messages.buildPlanProposedMessage)(this.deps.config, taskId, planId, summary, plan, dependencies));
    };
    this.onCheckpointCreated = (taskId, checkpointId, summary, metadata) => {
      this.deps.persistenceService.recordExecutionEvent("checkpoint_created", summary, {
        taskId,
        checkpointId,
        metadata
      }, {
        taskId,
        normalizedVerb: "checkpoint.created",
        transportBody: {
          checkpointId,
          taskId,
          summary,
          metadata
        }
      });
      this.deps.gateway.send((0, import_messages.buildCheckpointCreatedMessage)(
        this.deps.config,
        taskId,
        taskId,
        checkpointId,
        summary,
        metadata
      ));
    };
    this.onVerificationRequested = (taskId, verificationType, requestedBy, detail) => {
      this.deps.persistenceService.recordExecutionEvent("verification_requested", detail ?? verificationType, {
        taskId,
        verificationType,
        requestedBy
      }, {
        taskId,
        normalizedVerb: "verification.requested",
        transportBody: {
          taskId,
          verificationType,
          requestedBy,
          detail
        }
      });
      this.deps.gateway.send((0, import_messages.buildVerificationRequestedMessage)(
        this.deps.config,
        taskId,
        verificationType,
        requestedBy,
        detail
      ));
    };
    this.onVerificationOutcome = (taskId, stage, status, summary, attemptId, reviewer) => {
      this.deps.persistenceService.recordExecutionEvent("verification_completed", summary ?? status, {
        taskId,
        stage,
        status,
        attemptId,
        reviewer
      }, {
        taskId,
        normalizedVerb: "verification.completed",
        transportBody: {
          taskId,
          stage,
          status,
          summary,
          attemptId,
          reviewer
        }
      });
      this.deps.gateway.send((0, import_messages.buildVerificationCompletedMessage)(
        this.deps.config,
        taskId,
        stage,
        status,
        reviewer ?? this.deps.config.agentName,
        summary
      ));
    };
  }
  log(event, detail) {
    if (!this.deps.config.debug) {
      return;
    }
    if (detail) {
      console.log("[OrchestratorEngine]", event, detail);
      return;
    }
    console.log("[OrchestratorEngine]", event);
  }
  handleAgentAssignment(taskId, agents) {
    this.log("agents.assigned", {
      taskId,
      agentCount: agents.length,
      agents: agents.map((agent) => ({
        attemptId: agent.attemptId,
        agentName: agent.agentName,
        role: agent.role
      }))
    });
    for (const agent of agents) {
      this.attemptMap.set(agent.attemptId, {
        taskId: agent.taskId,
        role: agent.role,
        agentName: agent.agentName
      });
    }
    const assignmentId = `${taskId}-${agents.map((agent) => agent.attemptId).join("-")}`;
    this.deps.gateway.send((0, import_messages.buildTaskAssignedMessage)(this.deps.config, taskId, taskId, assignmentId, agents));
  }
  handleAgentCommunication(_taskId, _message) {
  }
  async handleMessage(message, source) {
    this.log("message.received", {
      source,
      type: message.type,
      normalizedVerb: message.verb,
      taskId: message.task_id ?? message.room_id,
      actorId: message.from.actor_id,
      actorName: message.from.actor_name,
      messageId: message.message_id
    });
    if (message.type === "task_created") {
      this.handleTaskCreated(message);
      return;
    }
    if (message.type === "tool_request") {
      await this.handleToolRequest(message);
      return;
    }
    if (message.type === "chat" && source === "operator") {
      const content = await this.deps.chatResponder.respond(message.payload.content);
      this.deps.gateway.send((0, import_messages.buildOperatorChatResponse)(this.deps.config, content));
      return;
    }
    if (message.type !== "status_update") {
      return;
    }
    this.handleStatusUpdate(message);
  }
  handleTaskCreated(message) {
    const payload = message.payload;
    this.log("task.created", {
      taskId: payload.task_id,
      title: payload.title,
      priority: payload.priority,
      createdBy: payload.created_by ?? payload.created_by_user_id
    });
    const task = this.deps.persistenceService.createTask({
      taskId: payload.task_id,
      name: payload.title ?? payload.task_id,
      priority: payload.priority ?? "medium",
      status: "planning",
      metadata: {
        description: payload.description ?? "",
        task_type: payload.task_type ?? "task",
        created_by: payload.created_by ?? payload.created_by_user_id ?? "operator",
        branch_name: payload.branch_name,
        queue_depth: 0,
        fallback_count: 0
      }
    });
    this.deps.registry.register({
      taskId: task.taskId,
      projectId: task.projectId,
      repoId: task.repoId,
      rootPath: task.rootPath,
      workspaceId: task.workspaceId,
      title: task.name,
      description: String(task.metadata?.description ?? ""),
      taskType: String(task.metadata?.task_type ?? "task"),
      priority: task.priority,
      createdAt: task.createdAt,
      createdByUserId: typeof task.metadata?.created_by === "string" ? task.metadata.created_by : void 0,
      branchName: typeof task.metadata?.branch_name === "string" ? task.metadata.branch_name : void 0
    });
    this.deps.gateway.watchTaskChannel(task.taskId);
    this.log("task.scheduling.requested", {
      taskId: task.taskId,
      runId: task.runId,
      status: task.status
    });
    this.deps.scheduler.handleNewTask(task.taskId);
  }
  handleStatusUpdate(message) {
    const payload = message.payload;
    const taskId = message.task_id ?? message.room_id;
    this.log("status.update.received", {
      taskId,
      actorId: message.from.actor_id,
      actorName: message.from.actor_name,
      statusCode: payload.status_code,
      normalizedVerb: message.verb
    });
    if (payload.status_code === "task_cancelled") {
      const detail = payload.content;
      this.deps.controlService.execute({ type: "cancel_task" }, taskId, message.from.actor_name, detail);
      return;
    }
    if (!payload.result || !["agent_completed", "agent_blocked", "agent_failed"].includes(payload.status_code)) {
      return;
    }
    const attempt = this.lookupAttempt(taskId, message.from.actor_id, message.from.actor_name);
    if (!attempt) {
      this.log("status.update.unmatched", {
        taskId,
        actorId: message.from.actor_id,
        statusCode: payload.status_code
      });
      return;
    }
    this.deps.persistenceService.recordExecutionEvent("agent_result", payload.content, {
      taskId,
      attemptId: attempt.attemptId,
      agentName: attempt.agentName,
      role: attempt.role,
      verb: message.verb,
      shorthand: message.shorthand
    });
    this.deps.scheduler.handleAgentResult(taskId, attempt.attemptId, attempt.agentName, attempt.role, payload.result);
  }
  async handleToolRequest(message) {
    const payload = message.payload;
    this.log("tool.request.received", {
      taskId: message.task_id ?? message.room_id,
      requestId: payload.request_id,
      toolName: payload.tool_name,
      actorId: message.from.actor_id,
      actorName: message.from.actor_name
    });
    const response = await this.deps.toolService.handleRequest({
      requestId: payload.request_id,
      toolName: payload.tool_name,
      taskId: message.task_id ?? message.room_id,
      agentName: message.from.actor_id,
      parameters: payload.parameters
    });
    this.deps.gateway.send((0, import_messages.buildToolResponseMessage)(
      this.deps.config,
      message.task_id ?? message.room_id,
      payload.request_id,
      response.status,
      response.result,
      response.error
    ));
  }
  lookupAttempt(taskId, actorId, actorName) {
    for (const [attemptId, attempt] of this.attemptMap.entries()) {
      if (attempt.taskId === taskId && (attempt.agentName === actorId || actorName && attempt.agentName === actorName)) {
        return { attemptId, ...attempt };
      }
    }
    const attempts = this.deps.persistenceService.listAttemptsForTask(taskId);
    const matched = attempts.find((attempt) => attempt.agentName === actorId || actorName && attempt.agentName === actorName);
    if (!matched) {
      return void 0;
    }
    const role = typeof matched.metadata?.role === "string" ? matched.metadata.role : "worker";
    this.attemptMap.set(matched.attemptId, { taskId, role, agentName: matched.agentName });
    return { attemptId: matched.attemptId, taskId, role, agentName: matched.agentName };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OrchestratorEngine
});
