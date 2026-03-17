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
var import_node_crypto = require("node:crypto");
var import_messages = require("../messages");
var import_protocol = require("../protocol");
var import_task_events = require("../task-events");
var import_operator_notifications = require("../operator-notifications");
var import_operator_intents = require("../operator/operator-intents");
class OrchestratorEngine {
  constructor(options) {
    this.options = options;
    this.prefix = "[OrchestratorEngine]";
    this.agentAttemptMap = /* @__PURE__ */ new Map();
    this.onPlanProposed = (taskId, planId, summary, plan, dependencies) => {
      this.options.gateway.send(
        (0, import_messages.buildPlanProposedMessage)(
          this.options.config,
          taskId,
          planId,
          summary,
          plan,
          dependencies
        )
      );
    };
    this.onCheckpointCreated = (taskId, checkpointId, summary, metadata) => {
      this.options.gateway.send(
        (0, import_messages.buildCheckpointCreatedMessage)(
          this.options.config,
          taskId,
          taskId,
          checkpointId,
          summary,
          metadata
        )
      );
    };
    this.onVerificationRequested = (taskId, verificationType, requestedBy, detail) => {
      this.options.gateway.send(
        (0, import_messages.buildVerificationRequestedMessage)(
          this.options.config,
          taskId,
          verificationType,
          requestedBy,
          detail
        )
      );
      this.sendStatusUpdate(
        "operator",
        taskId,
        "operator_review",
        "verification_requested",
        "Verification requested for task.",
        { verification_type: verificationType, detail }
      );
    };
    this.onVerificationOutcome = (taskId, stage, status, summary, attemptId, reviewer) => {
      this.options.gateway.send(
        (0, import_messages.buildVerificationCompletedMessage)(
          this.options.config,
          taskId,
          stage,
          status,
          reviewer ?? this.options.config.agentName,
          summary
        )
      );
      this.sendStatusUpdate(
        "operator",
        taskId,
        "operator_review",
        stage === "verification" ? "verification_completed" : "review_completed",
        `${stage} ${status}`,
        {
          stage,
          status,
          attempt_id: attemptId,
          reviewer
        }
      );
    };
  }
  async handleMessage(message, source) {
    if (message.project_id !== this.options.config.projectId) {
      return;
    }
    if (message.from.actor_name === this.options.config.agentName) {
      return;
    }
    const isTaskChannel = source === "task";
    if (isTaskChannel && message.type === "artifact_created") {
      this.persistArtifact(message);
      return;
    }
    if (!isTaskChannel && message.type === "status_update" && message.room_id === "operator") {
      const statusMessage = message;
      if ((0, import_task_events.isCancellationMessage)(statusMessage)) {
        this.handleCancellation(statusMessage);
        return;
      }
      this.handleOperatorStatusMessage(statusMessage);
      return;
    }
    if (!isTaskChannel && message.type === "task_created") {
      this.handleTaskCreated(message);
      return;
    }
    if (message.type === "chat" && message.room_id === "operator") {
      await this.handleOperatorChat(message);
    }
  }
  handleAgentAssignment(taskId, agents) {
    if (!agents.length) {
      return;
    }
    for (const agent of agents) {
      this.agentAttemptMap.set(agent.agentName, agent.attemptId);
    }
    const details = agents.map((agent) => `${agent.agentName} (${agent.role})`).join(", ");
    const assignmentId = (0, import_node_crypto.randomUUID)();
    this.options.gateway.send((0, import_messages.buildTaskAssignedMessage)(
      this.options.config,
      taskId,
      taskId,
      assignmentId,
      agents
    ));
    this.sendStatusUpdate(
      taskId,
      taskId,
      "execution",
      "agent_assigned",
      `Assigned agents: ${details}.`,
      {
        assignment_id: assignmentId,
        assigned_agents: agents.map((agent) => ({
          agent_name: agent.agentName,
          agent_role: agent.role,
          attempt_id: agent.attemptId
        }))
      }
    );
  }
  handleAgentCommunication(taskId, content) {
    this.sendStatusUpdate(taskId, taskId, "execution", "agent_communication", content);
  }
  async handleTaskCreated(message) {
    const task = (0, import_task_events.resolveTaskFromMessage)(message);
    if (!task) {
      return;
    }
    this.options.registry.register(task);
    this.options.gateway.watchTaskChannel(task.taskId);
    const persisted = this.options.persistenceService.createTask({
      taskId: task.taskId,
      name: task.title ?? task.taskId,
      priority: this.normalizePriority(task.priority),
      metadata: {
        description: task.description,
        task_type: task.taskType,
        created_by: task.createdByUserId,
        branch_name: task.branchName
      }
    });
    this.options.gateway.send(
      (0, import_protocol.buildTaskIntakeAccepted)(this.options.config, task.taskId)
    );
    this.scheduleTask(persisted.taskId);
  }
  handleCancellation(message) {
    const task = (0, import_task_events.resolveTaskFromMessage)(message);
    if (!task) {
      return;
    }
    const removedAgents = this.options.supervisor.cancelTask(task.taskId);
    this.options.persistenceService.setTaskStatus(task.taskId, "cancelled");
    this.options.gateway.send(
      (0, import_messages.buildOrchestratorStatusUpdate)(
        this.options.config,
        "operator",
        "operator",
        "task_cancelled",
        "Task cancelled.",
        task.taskId,
        {
          removed_agents: removedAgents,
          removed_agent_count: removedAgents.length
        }
      )
    );
  }
  async handleOperatorChat(message) {
    const payload = message.payload;
    const content = typeof payload.content === "string" ? payload.content : "";
    if (!content) {
      return;
    }
    const metadataTaskId = typeof payload.metadata === "object" && payload.metadata !== null ? payload.metadata.task_id : void 0;
    const resolvedTaskId = message.task_id ?? (typeof metadataTaskId === "string" ? metadataTaskId : void 0);
    const intent = (0, import_operator_intents.parseOperatorIntent)(content, resolvedTaskId);
    this.sendStatusUpdate(
      "operator",
      void 0,
      "operator_instruction",
      "processing_operator_instruction",
      "Processing operator instruction."
    );
    if (intent.category === "note") {
      try {
        const response = await this.options.chatResponder.respond(content);
        this.options.gateway.send((0, import_messages.buildOperatorChatResponse)(this.options.config, response));
      } catch (error) {
        this.options.gateway.send(
          (0, import_messages.buildOperatorChatResponse)(
            this.options.config,
            error instanceof Error ? error.message : "Failed to process operator instruction."
          )
        );
      }
      return;
    }
    await this.handleOperatorCommand(intent.action, message, intent.referencedTaskId ?? resolvedTaskId);
  }
  handleOperatorStatusMessage(message) {
    const metadata = typeof message.payload.metadata === "object" && message.payload.metadata !== null ? message.payload.metadata : void 0;
    const taskId = message.task_id ?? (typeof metadata?.task_id === "string" ? metadata.task_id : void 0);
    if (!taskId) {
      return;
    }
    const status = typeof metadata?.status === "string" ? metadata.status : void 0;
    if (status === "review") {
      this.sendStatusUpdate(
        "operator",
        taskId,
        "operator_review",
        "operator_review_notice",
        (0, import_operator_notifications.buildReviewAnnouncement)(message.from.actor_name)
      );
    }
  }
  normalizePriority(value) {
    if (!value) {
      return "medium";
    }
    if (["low", "medium", "high", "urgent"].includes(value)) {
      return value;
    }
    return "medium";
  }
  persistArtifact(message) {
    const attemptId = this.agentAttemptMap.get(message.from.actor_name);
    if (!attemptId) {
      console.warn("[OrchestratorEngine] missing attempt for artifact", message.payload.artifact_id);
      return;
    }
    const metadata = typeof message.payload.metadata === "object" && message.payload.metadata !== null ? message.payload.metadata : void 0;
    this.options.persistenceService.recordArtifact({
      artifactId: message.payload.artifact_id,
      attemptId,
      taskId: message.payload.task_id,
      kind: message.payload.kind,
      summary: message.payload.summary,
      content: message.payload.content,
      metadata,
      createdAt: message.timestamp
    });
  }
  sendStatusUpdate(roomId, taskId, phase, statusCode, content, extraPayload) {
    this.options.gateway.send(
      (0, import_messages.buildOrchestratorStatusUpdate)(
        this.options.config,
        roomId,
        phase,
        statusCode,
        content,
        taskId,
        extraPayload
      )
    );
  }
  async handleOperatorCommand(action, message, taskId) {
    if (!taskId) {
      this.options.gateway.send((0, import_messages.buildOperatorChatResponse)(
        this.options.config,
        "Could not determine which task you meant; please include a task identifier."
      ));
      return;
    }
    const detail = action.reason ?? message.payload.content ?? action.type;
    const outcome = this.options.controlService.execute(action, taskId, message.from.actor_name, detail);
    if (outcome.actionType === "cancel_task") {
      const removedAgents = outcome.removedAgents ?? [];
      this.options.gateway.send(
        (0, import_messages.buildOrchestratorStatusUpdate)(
          this.options.config,
          "operator",
          "operator",
          "task_cancelled",
          `Cancelled task per operator: ${detail}`,
          taskId,
          {
            removed_agents: removedAgents,
            removed_agent_count: removedAgents.length
          }
        )
      );
    }
    if (outcome.reviewRequested) {
      this.onVerificationRequested(taskId, "operator_review", message.from.actor_name, detail);
    }
    if (outcome.priority) {
      this.sendStatusUpdate(
        "operator",
        taskId,
        "operator_instruction",
        "reprioritized",
        `Updated priority to ${outcome.priority}.`
      );
    }
    this.options.gateway.send((0, import_messages.buildOperatorChatResponse)(
      this.options.config,
      `Recorded operator action: ${outcome.actionType}.`
    ));
  }
  scheduleTask(taskId) {
    this.options.scheduler.handleNewTask(taskId);
  }
  log(...items) {
    console.log(this.prefix, ...items);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OrchestratorEngine
});
