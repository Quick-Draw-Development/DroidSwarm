import assert from 'node:assert/strict';
import test from 'node:test';

import { RoomManager } from './RoomManager';
import type { ConnectedClient, WebSocketLike } from '../types';

class FakeSocket implements WebSocketLike {
  readonly sent: string[] = [];
  readyState = 1;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

const createClient = (overrides: Partial<ConnectedClient> = {}): ConnectedClient => ({
  connectionId: overrides.connectionId ?? 'conn-1',
  socket: overrides.socket ?? new FakeSocket(),
  roomId: overrides.roomId ?? 'task-1',
  agentName: overrides.agentName ?? 'Planner-Alpha',
  agentRole: overrides.agentRole ?? 'planner',
  clientType: overrides.clientType ?? 'agent',
  actorType: overrides.actorType ?? 'agent',
  privileged: overrides.privileged ?? false,
  authenticatedAt: overrides.authenticatedAt ?? Date.now(),
  lastSeenAt: overrides.lastSeenAt ?? Date.now(),
});

test('room manager rejects duplicate non-privileged names in a room', () => {
  const manager = new RoomManager();
  manager.addClient(createClient({ connectionId: 'conn-1' }));

  assert.throws(() => manager.addClient(createClient({ connectionId: 'conn-2' })));
});

test('room manager allows privileged observers to share names', () => {
  const manager = new RoomManager();
  manager.addClient(createClient({ connectionId: 'conn-1', agentName: 'Orchestrator', privileged: true, clientType: 'orchestrator', actorType: 'orchestrator' }));
  assert.doesNotThrow(() =>
    manager.addClient(createClient({ connectionId: 'conn-2', agentName: 'Orchestrator', privileged: true, clientType: 'orchestrator', actorType: 'orchestrator' })),
  );
});
