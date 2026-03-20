var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));
var import_RoomManager = require("./RoomManager");
class FakeSocket {
  constructor() {
    this.sent = [];
    this.readyState = 1;
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
}
const createClient = (overrides = {}) => ({
  connectionId: overrides.connectionId ?? "conn-1",
  socket: overrides.socket ?? new FakeSocket(),
  roomId: overrides.roomId ?? "task-1",
  agentName: overrides.agentName ?? "Planner-Alpha",
  agentRole: overrides.agentRole ?? "planner",
  clientType: overrides.clientType ?? "agent",
  actorType: overrides.actorType ?? "agent",
  privileged: overrides.privileged ?? false,
  authenticatedAt: overrides.authenticatedAt ?? Date.now(),
  lastSeenAt: overrides.lastSeenAt ?? Date.now()
});
(0, import_node_test.default)("room manager rejects duplicate non-privileged names in a room", () => {
  const manager = new import_RoomManager.RoomManager();
  manager.addClient(createClient({ connectionId: "conn-1" }));
  import_strict.default.throws(() => manager.addClient(createClient({ connectionId: "conn-2" })));
});
(0, import_node_test.default)("room manager allows privileged observers to share names", () => {
  const manager = new import_RoomManager.RoomManager();
  manager.addClient(createClient({ connectionId: "conn-1", agentName: "Orchestrator", privileged: true, clientType: "orchestrator", actorType: "orchestrator" }));
  import_strict.default.doesNotThrow(
    () => manager.addClient(createClient({ connectionId: "conn-2", agentName: "Orchestrator", privileged: true, clientType: "orchestrator", actorType: "orchestrator" }))
  );
});
