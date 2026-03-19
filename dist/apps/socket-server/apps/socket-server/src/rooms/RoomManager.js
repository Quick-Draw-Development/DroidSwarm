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
var RoomManager_exports = {};
__export(RoomManager_exports, {
  RoomManager: () => RoomManager
});
module.exports = __toCommonJS(RoomManager_exports);
var import_Room = require("./Room");
const channelTypeForRoom = (roomId) => {
  if (roomId === "operator") {
    return "operator";
  }
  if (roomId.endsWith("-planning")) {
    return "planning";
  }
  if (roomId.endsWith("-review")) {
    return "review";
  }
  if (roomId.endsWith("-execution")) {
    return "execution";
  }
  return "task";
};
class RoomManager {
  constructor() {
    this.rooms = /* @__PURE__ */ new Map();
  }
  getOrCreateRoom(roomId) {
    const existingRoom = this.rooms.get(roomId);
    if (existingRoom) {
      return existingRoom;
    }
    const createdRoom = new import_Room.Room(roomId, channelTypeForRoom(roomId));
    this.rooms.set(roomId, createdRoom);
    return createdRoom;
  }
  addClient(client) {
    const room = this.getOrCreateRoom(client.roomId);
    room.addClient(client);
    return room;
  }
  removeClient(roomId, connectionId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    room.removeClient(connectionId);
    if (room.size === 0) {
      this.rooms.delete(roomId);
    }
  }
  broadcast(roomId, message, excludeConnectionId) {
    const room = this.rooms.get(roomId);
    room?.broadcast(message, excludeConnectionId);
  }
  getClient(roomId, connectionId) {
    return this.rooms.get(roomId)?.getClient(connectionId);
  }
  listRoomIds() {
    return [...this.rooms.keys()];
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RoomManager
});
//# sourceMappingURL=RoomManager.js.map
