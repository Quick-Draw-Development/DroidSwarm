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
        projectId: this.config.projectId
      },
      "Socket server started"
    );
  }
  async stop() {
    if (this.heartbeatSweep) {
      clearInterval(this.heartbeatSweep);
      this.heartbeatSweep = void 0;
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
      message = (0, import_validate.parseMessageEnvelope)(rawMessage);
    } catch (error) {
      this.sendRoomError(client, "Invalid message envelope", "invalid_message_envelope");
      return;
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
  }
  handleRoutingSideEffects(message) {
    if (message.type === "task_created") {
      const taskId = message.task_id ?? (typeof message.payload.task_id === "string" ? message.payload.task_id : void 0);
      if (!taskId) {
        return;
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
