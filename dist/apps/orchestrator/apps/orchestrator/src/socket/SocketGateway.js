var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var SocketGateway_exports = {};
__export(SocketGateway_exports, {
  SocketGateway: () => SocketGateway
});
module.exports = __toCommonJS(SocketGateway_exports);
var import_ws = __toESM(require("ws"), 1);
var import_protocol = require("../protocol");
class SocketGateway {
  constructor(config) {
    this.config = config;
    this.stopped = false;
    this.prefix = "[SocketGateway]";
    this.channelSockets = /* @__PURE__ */ new Map();
    this.channelHeartbeats = /* @__PURE__ */ new Map();
    this.channelReconnects = /* @__PURE__ */ new Map();
  }
  log(...args) {
    if (!this.config.debug) {
      return;
    }
    console.log(this.prefix, ...args);
  }
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }
  start() {
    this.stopped = false;
    this.connect();
  }
  stop() {
    this.stopped = true;
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = void 0;
    }
    for (const timer of this.channelReconnects.values()) {
      clearTimeout(timer);
    }
    this.channelReconnects.clear();
    for (const timer of this.channelHeartbeats.values()) {
      clearInterval(timer);
    }
    this.channelHeartbeats.clear();
    for (const socket of this.channelSockets.values()) {
      socket.close();
    }
    this.channelSockets.clear();
    if (this.socket) {
      this.socket.close();
    }
  }
  send(message) {
    if ("message_id" in message) {
      this.log("sending operator message", {
        type: message.type,
        normalizedVerb: message.verb,
        taskId: message.task_id,
        roomId: message.room_id,
        messageId: message.message_id
      });
    }
    this.sendToSocket(this.socket, message);
  }
  sendToTask(taskId, message) {
    const channelSocket = this.channelSockets.get(taskId);
    if (!channelSocket) {
      console.warn("[SocketGateway] task channel not open for", taskId);
      return;
    }
    this.log("sending task message", {
      taskId,
      type: message.type,
      normalizedVerb: message.verb,
      messageId: message.message_id
    });
    this.sendToSocket(channelSocket, message);
  }
  watchTaskChannel(taskId) {
    if (this.stopped || this.channelSockets.has(taskId)) {
      return;
    }
    const agentName = `${this.config.agentName}-${taskId}`;
    const channelSocket = new import_ws.default(this.config.socketUrl);
    this.channelSockets.set(taskId, channelSocket);
    this.log("connecting to task channel", taskId);
    channelSocket.on("open", () => {
      this.clearChannelReconnect(taskId);
      this.sendToSocket(
        channelSocket,
        (0, import_protocol.buildRoomAuthMessage)(this.config, taskId, agentName, "orchestrator")
      );
      this.startChannelHeartbeat(taskId, channelSocket, agentName);
    });
    channelSocket.on("message", (raw) => {
      this.emitMessage(raw, "task");
    });
    channelSocket.on("close", () => {
      this.clearChannelHeartbeat(taskId);
      this.channelSockets.delete(taskId);
      if (!this.stopped) {
        this.scheduleTaskChannelReconnect(taskId);
      }
    });
    channelSocket.on("error", () => {
      channelSocket.close();
    });
  }
  connect() {
    const socket = new import_ws.default(this.config.socketUrl);
    this.socket = socket;
    this.log("connecting to socket server at", this.config.socketUrl);
    socket.on("open", () => {
      this.send((0, import_protocol.buildAuthMessage)(this.config));
      this.startHeartbeat();
      this.log("connection established");
    });
    socket.on("message", (raw) => {
      this.emitMessage(raw, "operator");
    });
    socket.on("close", () => {
      this.clearHeartbeat();
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = void 0;
          this.connect();
        }, this.config.reconnectMs);
      }
    });
    socket.on("error", () => {
      socket.close();
    });
  }
  emitMessage(raw, source) {
    if (!this.messageHandler) {
      return;
    }
    try {
      const message = (0, import_protocol.parseEnvelope)(raw.toString());
      this.log("received message", {
        source,
        type: message.type,
        normalizedVerb: message.verb,
        taskId: message.task_id,
        roomId: message.room_id,
        messageId: message.message_id
      });
      void this.messageHandler(message, source);
    } catch {
    }
  }
  startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send((0, import_protocol.buildHeartbeatMessage)(this.config));
    }, this.config.heartbeatMs);
  }
  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = void 0;
    }
  }
  startChannelHeartbeat(taskId, socket, agentName) {
    this.clearChannelHeartbeat(taskId);
    const timer = setInterval(() => {
      this.sendToSocket(socket, (0, import_protocol.buildRoomHeartbeatMessage)(this.config, taskId, agentName));
    }, this.config.heartbeatMs);
    this.channelHeartbeats.set(taskId, timer);
  }
  clearChannelHeartbeat(taskId) {
    const timer = this.channelHeartbeats.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.channelHeartbeats.delete(taskId);
    }
  }
  scheduleTaskChannelReconnect(taskId) {
    this.clearChannelReconnect(taskId);
    const timer = setTimeout(() => {
      this.channelReconnects.delete(taskId);
      this.watchTaskChannel(taskId);
    }, this.config.reconnectMs);
    this.channelReconnects.set(taskId, timer);
  }
  clearChannelReconnect(taskId) {
    const timer = this.channelReconnects.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.channelReconnects.delete(taskId);
    }
  }
  sendToSocket(socket, message) {
    if (!socket || socket.readyState !== import_ws.default.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SocketGateway
});
