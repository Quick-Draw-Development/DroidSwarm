import type { ConnectedClient, MessageEnvelope } from '../types';

import { Room } from './Room';

const channelTypeForRoom = (roomId: string): Room['channelType'] => {
  if (roomId === 'operator') {
    return 'operator';
  }
  if (roomId.endsWith('-planning')) {
    return 'planning';
  }
  if (roomId.endsWith('-review')) {
    return 'review';
  }
  if (roomId.endsWith('-execution')) {
    return 'execution';
  }
  return 'task';
};

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  getOrCreateRoom(roomId: string): Room {
    const existingRoom = this.rooms.get(roomId);
    if (existingRoom) {
      return existingRoom;
    }

    const createdRoom = new Room(roomId, channelTypeForRoom(roomId));
    this.rooms.set(roomId, createdRoom);
    return createdRoom;
  }

  addClient(client: ConnectedClient): Room {
    const room = this.getOrCreateRoom(client.roomId);
    room.addClient(client);
    return room;
  }

  removeClient(roomId: string, connectionId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.removeClient(connectionId);
    if (room.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  broadcast(roomId: string, message: MessageEnvelope, excludeConnectionId?: string): void {
    const room = this.rooms.get(roomId);
    room?.broadcast(message, excludeConnectionId);
  }

  getClient(roomId: string, connectionId: string): ConnectedClient | undefined {
    return this.rooms.get(roomId)?.getClient(connectionId);
  }

  listRoomIds(): string[] {
    return [...this.rooms.keys()];
  }
}
