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
  SqlitePersistence: () => SqlitePersistence
});
module.exports = __toCommonJS(repositories_exports);
const asJson = (value) => JSON.stringify(value ?? {});
const extractMentions = (message) => {
  const payload = message.payload;
  if (message.type === "clarification_request") {
    const targetUserId = typeof payload.target_user_id === "string" ? payload.target_user_id : void 0;
    if (targetUserId) {
      return [{ mentionedType: "human", mentionedId: targetUserId, mentionedName: targetUserId }];
    }
  }
  const mentions = payload.mentions;
  if (!Array.isArray(mentions)) {
    return [];
  }
  return mentions.flatMap((mention) => {
    if (typeof mention === "object" && mention !== null && typeof mention.type === "string" && typeof mention.id === "string" && typeof mention.name === "string") {
      return [{ mentionedType: mention.type, mentionedId: mention.id, mentionedName: mention.name }];
    }
    return [];
  });
};
class SqlitePersistence {
  constructor(database) {
    this.database = database;
  }
  migrate() {
  }
  ensureChannel(input) {
    this.database.prepare(`
        INSERT INTO channels (channel_id, project_id, task_id, channel_type, name, status, created_at, updated_at)
        VALUES (@channelId, @projectId, @taskId, @channelType, @name, @status, @createdAt, @updatedAt)
        ON CONFLICT(channel_id) DO UPDATE SET
          task_id = excluded.task_id,
          channel_type = excluded.channel_type,
          name = excluded.name,
          status = excluded.status,
          updated_at = excluded.updated_at
      `).run({
      ...input,
      taskId: input.taskId ?? null
    });
  }
  recordConnectionOpened(record) {
    this.database.prepare(`
        INSERT INTO connections (
          connection_id, project_id, channel_id, client_type, client_id, client_name,
        auth_status, opened_at, last_seen_at, metadata_json
      ) VALUES (
        @connectionId, @projectId, @roomId, @clientType, @clientId, @clientName,
        @authStatus, @openedAt, @lastSeenAt, @metadata
      )
      `).run({
      ...record,
      metadata: asJson(record.metadata)
    });
  }
  recordConnectionAuth(record) {
    this.database.prepare(`
        UPDATE connections
        SET auth_status = @authStatus,
            client_type = @clientType,
            client_id = @clientId,
            client_name = @clientName,
            channel_id = @roomId,
            last_seen_at = @lastSeenAt
        WHERE connection_id = @connectionId
      `).run(record);
  }
  recordConnectionClosed(record) {
    this.database.prepare(`
        UPDATE connections
        SET closed_at = @closedAt,
            close_code = @closeCode,
            last_seen_at = @lastSeenAt
        WHERE connection_id = @connectionId
      `).run(record);
  }
  recordMessage(message) {
    const payload = message.payload;
    const content = typeof payload.content === "string" ? payload.content : null;
    this.database.prepare(`
        INSERT INTO messages (
          message_id, project_id, channel_id, task_id, session_id, trace_id,
          message_type, sender_type, sender_id, sender_name, content, payload_json,
          reply_to_message_id, created_at
        ) VALUES (
          @message_id, @project_id, @room_id, @task_id, @session_id, @trace_id,
          @type, @sender_type, @sender_id, @sender_name, @content, @payload_json,
          @reply_to, @timestamp
        )
      `).run({
      message_id: message.message_id,
      project_id: message.project_id,
      room_id: message.room_id,
      task_id: message.task_id ?? null,
      session_id: message.session_id ?? null,
      trace_id: message.trace_id ?? null,
      type: message.type,
      sender_type: message.from.actor_type,
      sender_id: message.from.actor_id,
      sender_name: message.from.actor_name,
      content,
      payload_json: asJson({
        payload,
        usage: message.usage,
        compression: message.compression
      }),
      reply_to: message.reply_to ?? null,
      timestamp: message.timestamp
    });
    for (const mention of extractMentions(message)) {
      this.database.prepare(`
          INSERT OR REPLACE INTO message_mentions (
            message_id, mentioned_type, mentioned_id, mentioned_name, created_at
          ) VALUES (
            @messageId, @mentionedType, @mentionedId, @mentionedName, @createdAt
          )
        `).run({
        messageId: message.message_id,
        mentionedType: mention.mentionedType,
        mentionedId: mention.mentionedId,
        mentionedName: mention.mentionedName,
        createdAt: message.timestamp
      });
    }
    this.persistSpecializedMessage(message);
  }
  recordTaskEvent(input) {
    this.database.prepare(`
        INSERT INTO task_events (
          event_id, project_id, task_id, event_type, actor_type, actor_id, payload_json, created_at
        ) VALUES (
          @eventId, @projectId, @taskId, @eventType, @actorType, @actorId, @payloadJson, @createdAt
        )
      `).run({
      ...input,
      payloadJson: asJson(input.payload)
    });
  }
  persistSpecializedMessage(message) {
    if (message.type === "handoff_event") {
      this.database.prepare(`
          INSERT OR REPLACE INTO handoffs (
            handoff_id, project_id, task_id, trace_id,
            from_actor_type, from_actor_id, to_actor_type, to_actor_id,
            reason, context_json, expected_outcome, status, created_at, updated_at
          ) VALUES (
            @handoffId, @projectId, @taskId, @traceId,
            @fromActorType, @fromActorId, @toActorType, @toActorId,
            @reason, @contextJson, @expectedOutcome, @status, @createdAt, @updatedAt
          )
        `).run({
        handoffId: String(message.payload.handoff_id ?? message.message_id),
        projectId: message.project_id,
        taskId: message.task_id ?? null,
        traceId: message.trace_id ?? null,
        fromActorType: message.from.actor_type,
        fromActorId: message.from.actor_id,
        toActorType: String(message.payload.to_actor_type ?? "agent"),
        toActorId: typeof message.payload.to_actor_id === "string" ? message.payload.to_actor_id : null,
        reason: String(message.payload.reason_code ?? "unspecified"),
        contextJson: asJson({ context_ref: message.payload.context_ref }),
        expectedOutcome: typeof message.payload.expected_outcome === "string" ? message.payload.expected_outcome : null,
        status: "open",
        createdAt: message.timestamp,
        updatedAt: message.timestamp
      });
    }
    if (message.type === "guardrail_event") {
      this.database.prepare(`
          INSERT OR REPLACE INTO guardrail_events (
            guardrail_event_id, project_id, task_id, trace_id, span_id,
            guardrail_name, phase, result, details_json, created_at
          ) VALUES (
            @eventId, @projectId, @taskId, @traceId, @spanId,
            @guardrailName, @phase, @result, @detailsJson, @createdAt
          )
        `).run({
        eventId: message.message_id,
        projectId: message.project_id,
        taskId: message.task_id ?? null,
        traceId: message.trace_id ?? null,
        spanId: message.span_id ?? null,
        guardrailName: String(message.payload.guardrail_name ?? "unknown"),
        phase: String(message.payload.phase ?? "input"),
        result: String(message.payload.result ?? "pass"),
        detailsJson: asJson(message.payload.details),
        createdAt: message.timestamp
      });
    }
    if (message.type === "trace_event") {
      this.database.prepare(`
          INSERT OR REPLACE INTO traces (
            trace_id, project_id, task_id, channel_id, workflow_name, status,
            started_by_type, started_by_id, started_at, ended_at, metadata_json
          ) VALUES (
            @traceId, @projectId, @taskId, @channelId, @workflowName, @status,
            @startedByType, @startedById, @startedAt, @endedAt, @metadataJson
          )
        `).run({
        traceId: String(message.payload.trace_id ?? message.trace_id ?? message.message_id),
        projectId: message.project_id,
        taskId: message.task_id ?? null,
        channelId: message.room_id,
        workflowName: String(message.payload.event_name ?? "workflow"),
        status: String(message.payload.status ?? "running"),
        startedByType: message.from.actor_type,
        startedById: message.from.actor_id,
        startedAt: message.timestamp,
        endedAt: message.payload.status === "completed" ? message.timestamp : null,
        metadataJson: asJson(message.payload.metadata)
      });
    }
    if (message.type === "limit_event") {
      this.database.prepare(`
          INSERT OR REPLACE INTO limit_events (
            limit_event_id, project_id, task_id, channel_id, session_id, trace_id, span_id,
            actor_type, actor_id, limit_type, scope_type, scope_id, status, threshold_name,
            current_value, threshold_value, retry_after_ms, degraded_mode, details_json, created_at
          ) VALUES (
            @limitEventId, @projectId, @taskId, @channelId, @sessionId, @traceId, @spanId,
            @actorType, @actorId, @limitType, @scopeType, @scopeId, @status, @thresholdName,
            @currentValue, @thresholdValue, @retryAfterMs, @degradedMode, @detailsJson, @createdAt
          )
        `).run({
        limitEventId: String(message.payload.limit_event_id ?? message.message_id),
        projectId: message.project_id,
        taskId: message.task_id ?? null,
        channelId: message.room_id,
        sessionId: message.session_id ?? null,
        traceId: message.trace_id ?? null,
        spanId: message.span_id ?? null,
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        limitType: String(message.payload.limit_type ?? "context_window"),
        scopeType: String(message.payload.scope_type ?? "task"),
        scopeId: typeof message.payload.scope_id === "string" ? message.payload.scope_id : null,
        status: String(message.payload.status ?? "near_limit"),
        thresholdName: typeof message.payload.threshold_name === "string" ? message.payload.threshold_name : null,
        currentValue: typeof message.payload.current_value === "number" ? message.payload.current_value : null,
        thresholdValue: typeof message.payload.threshold_value === "number" ? message.payload.threshold_value : null,
        retryAfterMs: typeof message.payload.retry_after_ms === "number" ? message.payload.retry_after_ms : null,
        degradedMode: typeof message.payload.degraded_mode === "string" ? message.payload.degraded_mode : null,
        detailsJson: asJson(message.payload),
        createdAt: message.timestamp
      });
    }
    if (message.type === "checkpoint_event") {
      this.database.prepare(`
          INSERT OR REPLACE INTO session_checkpoints (
            checkpoint_id, project_id, session_id, task_id, trace_id, checkpoint_type,
            summary, facts_json, recent_delta_json, created_by_type, created_by_id, created_at
          ) VALUES (
            @checkpointId, @projectId, @sessionId, @taskId, @traceId, @checkpointType,
            @summary, @factsJson, @recentDeltaJson, @createdByType, @createdById, @createdAt
          )
        `).run({
        checkpointId: String(message.payload.checkpoint_id ?? message.message_id),
        projectId: message.project_id,
        sessionId: String(message.payload.session_id ?? message.session_id ?? "unknown-session"),
        taskId: message.task_id ?? null,
        traceId: message.trace_id ?? null,
        checkpointType: String(message.payload.checkpoint_type ?? "manual"),
        summary: typeof message.payload.content === "string" ? message.payload.content : null,
        factsJson: asJson({ summary_ref: message.payload.summary_ref }),
        recentDeltaJson: asJson(message.payload),
        createdByType: message.from.actor_type,
        createdById: message.from.actor_id,
        createdAt: message.timestamp
      });
    }
  }
  recordAuditEvent(input) {
    this.database.prepare(`
        INSERT INTO audit_events (
          audit_event_id, project_id, task_id, channel_id, connection_id, trace_id,
          event_type, actor_type, actor_id, details_json, created_at
        ) VALUES (
          @auditEventId, @projectId, @taskId, @channelId, @connectionId, @traceId,
          @eventType, @actorType, @actorId, @detailsJson, @createdAt
        )
      `).run({
      ...input,
      detailsJson: asJson(input.details)
    });
  }
  close() {
    this.database.close();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SqlitePersistence
});
//# sourceMappingURL=repositories.js.map
