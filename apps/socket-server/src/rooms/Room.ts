import type { ConnectedClient, MessageEnvelope } from '../types';

export class Room {
  private readonly clients = new Map<string, ConnectedClient>();

  constructor(
    readonly roomId: string,
    readonly channelType: 'operator' | 'task' | 'planning' | 'execution' | 'review',
  ) {}

  addClient(client: ConnectedClient): void {
    const nameConflict = [...this.clients.values()].some((currentClient) =>
      !currentClient.privileged &&
      !client.privileged &&
      currentClient.agentName === client.agentName,
    );

    if (nameConflict) {
      throw new Error(`Duplicate agent name '${client.agentName}' in room '${this.roomId}'`);
    }

    this.clients.set(client.connectionId, client);
  }

  removeClient(connectionId: string): void {
    this.clients.delete(connectionId);
  }

  getClient(connectionId: string): ConnectedClient | undefined {
    return this.clients.get(connectionId);
  }

  get size(): number {
    return this.clients.size;
  }

  getClients(): ConnectedClient[] {
    return [...this.clients.values()];
  }

  broadcast(message: MessageEnvelope, excludeConnectionId?: string): void {
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
