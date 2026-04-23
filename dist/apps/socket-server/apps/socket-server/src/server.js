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
var server_exports = {};
__export(server_exports, {
  DroidSwarmSocketServer: () => DroidSwarmSocketServer,
  createDefaultSocketServer: () => createDefaultSocketServer,
  createSocketServer: () => createSocketServer
});
module.exports = __toCommonJS(server_exports);
var import_node_crypto = require("node:crypto");
var import_node_http = require("node:http");
var import_ws = require("ws");
var import_federation_bus = require("@federation-bus");
var import_authenticate = require("./auth/authenticate");
var import_client = require("./db/client");
var import_repositories = require("./db/repositories");
var import_audit = require("./logging/audit");
var import_Logger = require("./logging/Logger");
var import_messages = require("./protocol/messages");
var import_validate = require("./protocol/validate");
var import_RoomManager = require("./rooms/RoomManager");
const HEARTBEAT_CLOSE_CODE = 4e3;
const AUTH_CLOSE_CODE = 1008;
const POLICY_CLOSE_CODE = 4408;
class DroidSwarmSocketServer {
  constructor(config) {
    this.config = config;
    this.httpServer = (0, import_node_http.createServer)();
    this.webSocketServer = new import_ws.WebSocketServer({ server: this.httpServer });
    this.roomManager = new import_RoomManager.RoomManager();
    this.socketStates = /* @__PURE__ */ new WeakMap();
    this.federationLastSequence = 0;
    const database = (0, import_client.createDatabase)(config.dbPath);
    this.persistence = new import_repositories.SqlitePersistence(database);
    this.persistence.migrate();
    this.logger = (0, import_Logger.createLogger)(config);
    this.webSocketServer.on("connection", (socket) => {
      this.handleConnection(socket);
    });
  }
  async start() {
    await new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
    this.heartbeatSweep = setInterval(() => {
      this.sweepIdleConnections();
    }, Math.max(1e3, Math.floor(this.config.heartbeatTimeoutMs / 3)));
    this.logger.info(
      {
        host: this.config.host,
        port: this.config.port,
        projectId: this.config.projectId,
        dbPath: this.config.dbPath,
        debug: this.config.debug,
        federationEnabled: this.config.federationEnabled,
        federationBusUrl: this.config.federationBusUrl
      },
      "Socket server started"
    );
    if (this.config.federationEnabled && this.config.federationBusUrl) {
      await this.startFederationPolling();
    }
  }
  async stop() {
    if (this.heartbeatSweep) {
      clearInterval(this.heartbeatSweep);
      this.heartbeatSweep = void 0;
    }
    if (this.federationPoller) {
      clearInterval(this.federationPoller);
      this.federationPoller = void 0;
    }
    for (const client of this.webSocketServer.clients) {
      client.close();
    }
    await new Promise((resolve, reject) => {
      this.webSocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        this.httpServer.close((httpError) => {
          if (httpError) {
            reject(httpError);
            return;
          }
          resolve();
        });
      });
    });
    this.persistence.close();
  }
  handleConnection(socket) {
    const connectionId = (0, import_node_crypto.randomUUID)();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const state = {
      connectionId,
      authenticated: false,
      messageTimestamps: []
    };
    this.socketStates.set(socket, state);
    state.authTimer = setTimeout(() => {
      if (!state.authenticated) {
        this.sendRawError(socket, "Authentication timed out", "auth_timeout");
        socket.close(AUTH_CLOSE_CODE, "Authentication timed out");
      }
    }, this.config.authTimeoutMs);
    this.persistence.recordConnectionOpened({
      connectionId,
      projectId: this.config.projectId,
      clientType: "unknown",
      clientId: connectionId,
      clientName: "pending",
      authStatus: "pending",
      openedAt: now,
      lastSeenAt: now,
      metadata: {},
      roomId: void 0
    });
    socket.on("message", (rawMessage) => {
      this.handleSocketMessage(socket, rawMessage.toString());
    });
    socket.on("close", (code) => {
      this.handleClose(socket, code);
    });
    socket.on("error", (error) => {
      this.logger.error({ error, connectionId }, "Socket error");
      (0, import_audit.writeAuditEvent)(this.persistence, {
        projectId: this.config.projectId,
        connectionId,
        eventType: "socket_error",
        details: { message: error.message }
      });
    });
  }
  handleSocketMessage(socket, rawMessage) {
    const state = this.getSocketState(socket);
    if (!state.authenticated) {
      this.handleAuthMessage(socket, rawMessage, state);
      return;
    }
    const client = state.authenticatedClient;
    if (!client) {
      this.sendRawError(socket, "Missing authenticated client state", "missing_client_state");
      socket.close(POLICY_CLOSE_CODE, "Missing authenticated client state");
      return;
    }
    client.lastSeenAt = Date.now();
    if (!this.acceptMessageUnderRateLimit(state)) {
      this.sendRoomError(client, "Rate limit exceeded", "rate_limit_exceeded");
      (0, import_audit.writeAuditEvent)(this.persistence, {
        projectId: this.config.projectId,
        channelId: client.roomId,
        connectionId: client.connectionId,
        actorType: client.actorType,
        actorId: client.connectionId,
        eventType: "rate_limit_exceeded",
        details: { room_id: client.roomId }
      });
      return;
    }
    let message;
    try {
      ({ message } = (0, import_validate.parseIncomingEnvelope)(rawMessage));
    } catch (error) {
      this.sendRoomError(client, "Invalid message envelope", "invalid_message_envelope");
      return;
    }
    if (this.config.debug) {
      this.logger.info(
        {
          connectionId: client.connectionId,
          roomId: client.roomId,
          sourceClientType: client.clientType,
          actorName: client.agentName,
          messageType: message.type,
          normalizedVerb: message.verb,
          taskId: message.task_id,
          messageId: message.message_id
        },
        "Received room message"
      );
    }
    if (message.project_id !== this.config.projectId || message.room_id !== client.roomId) {
      this.sendRoomError(client, "Message project or room mismatch", "message_scope_mismatch");
      return;
    }
    if (message.type === "heartbeat") {
      this.persistence.recordConnectionAuth({
        connectionId: client.connectionId,
        authStatus: "success",
        clientType: client.clientType,
        clientId: client.connectionId,
        clientName: client.agentName,
        roomId: client.roomId,
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    if ((0, import_validate.isOperatorOnlyMessage)(message.type) && (!client.privileged || client.roomId !== "operator")) {
      this.sendRoomError(client, "Operator-only message type", "operator_only_message");
      return;
    }
    const normalizedMessage = {
      ...message,
      from: {
        actor_type: client.actorType,
        actor_id: client.connectionId,
        actor_name: client.agentName
      }
    };
    this.persistence.ensureChannel({
      channelId: client.roomId,
      projectId: this.config.projectId,
      taskId: normalizedMessage.task_id,
      channelType: client.roomId === "operator" ? "operator" : "task",
      name: client.roomId,
      status: "active",
      createdAt: normalizedMessage.timestamp,
      updatedAt: normalizedMessage.timestamp
    });
    this.handleRoutingSideEffects(normalizedMessage);
    this.persistence.recordMessage(normalizedMessage);
    this.roomManager.broadcast(client.roomId, normalizedMessage);
    void this.publishToFederation(normalizedMessage);
    if (this.config.debug) {
      this.logger.info(
        {
          roomId: client.roomId,
          messageType: normalizedMessage.type,
          normalizedVerb: normalizedMessage.verb,
          taskId: normalizedMessage.task_id,
          messageId: normalizedMessage.message_id
        },
        "Persisted and broadcast room message"
      );
    }
  }
  async startFederationPolling() {
    try {
      const status = this.config.federationAdminUrl ? await (0, import_federation_bus.fetchBusStatus)(this.config.federationAdminUrl) : void 0;
      this.federationLastSequence = status?.recentEventCount ?? 0;
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to initialize federation bus status"
      );
    }
    this.federationPoller = setInterval(() => {
      void this.pollFederationBus();
    }, this.config.federationPollMs);
    this.federationPoller.unref?.();
  }
  async pollFederationBus() {
    if (!this.config.federationEnabled || !this.config.federationBusUrl) {
      return;
    }
    try {
      const result = await (0, import_federation_bus.fetchBusEvents)(this.config.federationBusUrl, this.federationLastSequence, 50);
      this.federationLastSequence = result.latestSequence;
      for (const event of result.events) {
        if (event.sourceNodeId === this.config.federationNodeId) {
          continue;
        }
        this.relayFederatedEnvelope(event.envelope);
      }
    } catch (error) {
      if (this.config.debug) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "Failed to poll federation bus"
        );
      }
    }
  }
  async publishToFederation(message) {
    if (!this.config.federationEnabled || !this.config.federationBusUrl) {
      return;
    }
    try {
      await (0, import_federation_bus.postToBus)(this.config.federationBusUrl, {
        sourceNodeId: this.config.federationNodeId,
        envelope: this.messageToEnvelopeV2(message)
      }, this.config.federationSigningKeyId && this.config.federationSigningPrivateKey ? {
        keyId: this.config.federationSigningKeyId,
        privateKeyPem: this.config.federationSigningPrivateKey
      } : void 0);
    } catch (error) {
      if (this.config.debug) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error), messageId: message.message_id },
          "Failed to publish envelope to federation bus"
        );
      }
    }
  }
  relayFederatedEnvelope(envelope) {
    const message = this.envelopeToMessage(envelope);
    try {
      this.persistence.ensureChannel({
        channelId: message.room_id,
        projectId: this.config.projectId,
        taskId: message.task_id,
        channelType: message.room_id === "operator" ? "operator" : "task",
        name: message.room_id,
        status: "active",
        createdAt: message.timestamp,
        updatedAt: message.timestamp
      });
      this.handleRoutingSideEffects(message);
      this.persistence.recordMessage(message);
      this.roomManager.broadcast(message.room_id, message);
      if (this.config.debug) {
        this.logger.info(
          { messageId: message.message_id, verb: message.verb, roomId: message.room_id, taskId: message.task_id },
          "Relayed federated envelope into local rooms"
        );
      }
    } catch (error) {
      if (this.config.debug) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error), messageId: envelope.id },
          "Failed to relay federated envelope"
        );
      }
    }
  }
  messageToEnvelopeV2(message) {
    return {
      id: message.id ?? message.message_id,
      ts: message.ts ?? message.timestamp,
      project_id: message.project_id,
      swarm_id: message.swarm_id ?? this.config.swarmId,
      run_id: message.run_id,
      task_id: message.task_id,
      room_id: message.room_id,
      agent_id: message.agent_id ?? message.from.actor_id,
      role: message.role,
      verb: message.verb,
      depends_on: message.depends_on,
      artifact_refs: message.artifact_refs,
      memory_refs: message.memory_refs,
      risk: message.risk,
      body: message.body ?? message.payload
    };
  }
  envelopeToMessage(envelope) {
    const typeByVerb = {
      "task.create": "task_created",
      "task.accept": "task_intake_accepted",
      "task.ready": "task_assigned",
      "task.blocked": "clarification_request",
      "plan.proposed": "plan_proposed",
      "spawn.requested": "spawn_requested",
      "spawn.approved": "spawn_approved",
      "spawn.denied": "spawn_denied",
      "artifact.created": "artifact_created",
      "checkpoint.created": "checkpoint_created",
      "verification.requested": "verification_requested",
      "verification.completed": "verification_completed",
      "run.completed": "run_completed",
      "handoff.ready": "handoff_event",
      "summary.emitted": "guardrail_event",
      "memory.pinned": "checkpoint_event",
      "drift.detected": "trace_event",
      "status.updated": "status_update",
      "tool.request": "tool_request",
      "tool.response": "tool_response",
      "chat.message": "chat",
      heartbeat: "heartbeat"
    };
    return {
      id: envelope.id,
      message_id: envelope.id,
      ts: envelope.ts,
      timestamp: envelope.ts,
      project_id: envelope.project_id,
      swarm_id: envelope.swarm_id,
      run_id: envelope.run_id,
      room_id: envelope.room_id,
      task_id: envelope.task_id,
      agent_id: envelope.agent_id,
      role: envelope.role,
      verb: envelope.verb,
      depends_on: envelope.depends_on,
      artifact_refs: envelope.artifact_refs,
      memory_refs: envelope.memory_refs,
      risk: envelope.risk,
      body: envelope.body,
      type: typeByVerb[envelope.verb],
      from: {
        actor_type: "agent",
        actor_id: envelope.agent_id ?? envelope.role ?? "federated-peer",
        actor_name: envelope.role ?? envelope.agent_id ?? "federated-peer"
      },
      payload: envelope.body
    };
  }
  handleRoutingSideEffects(message) {
    if (message.type === "task_created") {
      const taskId = message.task_id ?? (typeof message.payload.task_id === "string" ? message.payload.task_id : void 0);
      if (!taskId) {
        return;
      }
      if (this.config.debug) {
        this.logger.info(
          {
            taskId,
            roomId: message.room_id,
            actorId: message.from.actor_id,
            actorName: message.from.actor_name,
            normalizedVerb: message.verb
          },
          "Routing task creation into canonical task channel"
        );
      }
      this.persistence.ensureChannel({
        channelId: taskId,
        projectId: this.config.projectId,
        taskId,
        channelType: "task",
        name: taskId,
        status: "active",
        createdAt: message.timestamp,
        updatedAt: message.timestamp
      });
      this.persistence.recordTaskEvent({
        eventId: (0, import_node_crypto.randomUUID)(),
        projectId: this.config.projectId,
        taskId,
        eventType: "task_created",
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: message.payload,
        createdAt: message.timestamp
      });
      (0, import_audit.writeAuditEvent)(this.persistence, {
        projectId: this.config.projectId,
        taskId,
        channelId: "operator",
        eventType: "task_created_routed",
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        details: {
          task_id: taskId,
          routed_to_room: taskId
        }
      });
      return;
    }
    if (message.type === "task_intake_accepted") {
      const taskId = message.task_id ?? (typeof message.payload.task_id === "string" ? message.payload.task_id : void 0);
      if (!taskId) {
        return;
      }
      if (this.config.debug) {
        this.logger.info(
          {
            taskId,
            roomId: message.room_id,
            actorId: message.from.actor_id,
            actorName: message.from.actor_name
          },
          "Recorded task intake acknowledgement"
        );
      }
      this.persistence.recordTaskEvent({
        eventId: (0, import_node_crypto.randomUUID)(),
        projectId: this.config.projectId,
        taskId,
        eventType: "task_intake_accepted",
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: message.payload,
        createdAt: message.timestamp
      });
      return;
    }
    if (message.type === "status_update" && message.room_id === "operator" && message.task_id) {
      const statusCode = typeof message.payload.status_code === "string" ? message.payload.status_code : "task_status_changed";
      const nextStatus = typeof message.payload.metadata === "object" && message.payload.metadata !== null && typeof message.payload.metadata.status === "string" ? String(message.payload.metadata.status) : void 0;
      this.persistence.recordTaskEvent({
        eventId: (0, import_node_crypto.randomUUID)(),
        projectId: this.config.projectId,
        taskId: message.task_id,
        eventType: statusCode,
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: message.payload,
        createdAt: message.timestamp
      });
      (0, import_audit.writeAuditEvent)(this.persistence, {
        projectId: this.config.projectId,
        taskId: message.task_id,
        channelId: message.room_id,
        eventType: statusCode === "task_cancelled" ? "task_cancellation_requested" : "task_status_change_routed",
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        details: {
          task_id: message.task_id,
          next_status: nextStatus,
          orchestrator_action: statusCode === "task_cancelled" ? "stop_agents_and_remove_assignments" : "reconcile_task_state"
        }
      });
    }
    if (message.type === "tool_response" && message.task_id) {
      this.persistence.recordTaskEvent({
        eventId: (0, import_node_crypto.randomUUID)(),
        projectId: this.config.projectId,
        taskId: message.task_id,
        eventType: "tool_response",
        actorType: message.from.actor_type,
        actorId: message.from.actor_id,
        payload: {
          payload: message.payload,
          usage: message.usage
        },
        createdAt: message.timestamp
      });
    }
  }
  handleAuthMessage(socket, rawMessage, state) {
    let authMessage;
    try {
      authMessage = (0, import_validate.parseAuthMessage)(rawMessage);
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : "parse error", rawMessage }, "Failed to parse auth message");
      this.sendRawError(socket, "First message must be a valid auth message", "invalid_auth_message");
      socket.close(AUTH_CLOSE_CODE, "Invalid auth message");
      this.persistence.recordConnectionAuth({
        connectionId: state.connectionId,
        authStatus: "failed",
        clientType: "system",
        clientId: state.connectionId,
        clientName: "failed-auth",
        roomId: void 0,
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    try {
      const authResult = (0, import_authenticate.authenticateClient)(this.config, authMessage);
      this.finishAuthentication(socket, state, authResult);
    } catch (error) {
      const authError = error instanceof import_authenticate.AuthenticationError ? error : new import_authenticate.AuthenticationError("Authentication failed", "auth_failed");
      this.logger.warn(
        {
          reason: authError.reasonCode,
          message: authError.message,
          payload: authMessage.payload
        },
        "Authentication failure"
      );
      this.sendRawError(socket, authError.message, authError.reasonCode, authMessage.payload.room_id);
      socket.close(AUTH_CLOSE_CODE, authError.message);
      this.persistence.recordConnectionAuth({
        connectionId: state.connectionId,
        authStatus: "failed",
        clientType: authMessage.payload.client_type ?? "agent",
        clientId: state.connectionId,
        clientName: authMessage.payload.agent_name,
        roomId: authMessage.payload.room_id,
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  finishAuthentication(socket, state, authResult) {
    const client = {
      connectionId: state.connectionId,
      socket,
      roomId: authResult.roomId,
      agentName: authResult.agentName,
      agentRole: authResult.agentRole,
      clientType: authResult.clientType,
      actorType: authResult.actorType,
      privileged: authResult.privileged,
      authenticatedAt: Date.now(),
      lastSeenAt: Date.now()
    };
    try {
      this.roomManager.addClient(client);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Room join failed";
      this.sendRawError(socket, message, "duplicate_agent_name", authResult.roomId);
      socket.close(AUTH_CLOSE_CODE, message);
      this.persistence.recordConnectionAuth({
        connectionId: state.connectionId,
        authStatus: "failed",
        clientType: authResult.clientType,
        clientId: state.connectionId,
        clientName: authResult.agentName,
        roomId: authResult.roomId,
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    state.authenticated = true;
    state.authenticatedClient = client;
    if (state.authTimer) {
      clearTimeout(state.authTimer);
      state.authTimer = void 0;
    }
    this.persistence.ensureChannel({
      channelId: client.roomId,
      projectId: this.config.projectId,
      channelType: client.roomId === "operator" ? "operator" : "task",
      name: client.roomId,
      status: "active",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.persistence.recordConnectionAuth({
      connectionId: client.connectionId,
      authStatus: "success",
      clientType: client.clientType,
      clientId: client.connectionId,
      clientName: client.agentName,
      roomId: client.roomId,
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const response = (0, import_messages.buildAuthSuccessMessage)(this.config.projectId, client);
    client.socket.send(JSON.stringify(response));
  }
  handleClose(socket, closeCode) {
    const state = this.socketStates.get(socket);
    if (!state) {
      return;
    }
    if (state.authTimer) {
      clearTimeout(state.authTimer);
    }
    if (state.authenticatedClient) {
      this.roomManager.removeClient(state.authenticatedClient.roomId, state.authenticatedClient.connectionId);
      this.persistence.recordConnectionClosed({
        connectionId: state.authenticatedClient.connectionId,
        closedAt: (/* @__PURE__ */ new Date()).toISOString(),
        closeCode,
        lastSeenAt: new Date(state.authenticatedClient.lastSeenAt).toISOString()
      });
    } else {
      this.persistence.recordConnectionClosed({
        connectionId: state.connectionId,
        closedAt: (/* @__PURE__ */ new Date()).toISOString(),
        closeCode,
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  sendRawError(socket, message, reasonCode, roomId = "system") {
    const errorMessage = (0, import_messages.buildErrorMessage)(this.config.projectId, roomId, message, reasonCode);
    socket.send(JSON.stringify(errorMessage));
  }
  sendRoomError(client, message, reasonCode) {
    client.socket.send(JSON.stringify((0, import_messages.buildErrorMessage)(this.config.projectId, client.roomId, message, reasonCode)));
  }
  getSocketState(socket) {
    const state = this.socketStates.get(socket);
    if (!state) {
      throw new Error("Missing socket state");
    }
    return state;
  }
  acceptMessageUnderRateLimit(state) {
    const threshold = Date.now() - this.config.messageWindowMs;
    state.messageTimestamps = state.messageTimestamps.filter((timestamp) => timestamp >= threshold);
    if (state.messageTimestamps.length >= this.config.maxMessagesPerWindow) {
      return false;
    }
    state.messageTimestamps.push(Date.now());
    return true;
  }
  sweepIdleConnections() {
    const now = Date.now();
    for (const socket of this.webSocketServer.clients) {
      const state = this.socketStates.get(socket);
      if (!state?.authenticatedClient) {
        continue;
      }
      if (now - state.authenticatedClient.lastSeenAt > this.config.heartbeatTimeoutMs) {
        this.sendRoomError(state.authenticatedClient, "Heartbeat timeout", "heartbeat_timeout");
        socket.close(HEARTBEAT_CLOSE_CODE, "Heartbeat timeout");
      }
    }
  }
}
const createSocketServer = (config) => new DroidSwarmSocketServer(config);
const createDefaultSocketServer = () => {
  const { loadConfig } = require("./config");
  return new DroidSwarmSocketServer(loadConfig());
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DroidSwarmSocketServer,
  createDefaultSocketServer,
  createSocketServer
});
