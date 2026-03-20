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
var Room_exports = {};
__export(Room_exports, {
  Room: () => Room
});
module.exports = __toCommonJS(Room_exports);
class Room {
  constructor(roomId, channelType) {
    this.roomId = roomId;
    this.channelType = channelType;
    this.clients = /* @__PURE__ */ new Map();
  }
  addClient(client) {
    const nameConflict = [...this.clients.values()].some(
      (currentClient) => !currentClient.privileged && !client.privileged && currentClient.agentName === client.agentName
    );
    if (nameConflict) {
      throw new Error(`Duplicate agent name '${client.agentName}' in room '${this.roomId}'`);
    }
    this.clients.set(client.connectionId, client);
  }
  removeClient(connectionId) {
    this.clients.delete(connectionId);
  }
  getClient(connectionId) {
    return this.clients.get(connectionId);
  }
  get size() {
    return this.clients.size;
  }
  getClients() {
    return [...this.clients.values()];
  }
  broadcast(message, excludeConnectionId) {
    const serialized = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (excludeConnectionId && client.connectionId === excludeConnectionId) {
        continue;
      }
      if (client.socket.readyState === 1) {
        client.socket.send(serialized);
      }
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Room
});
