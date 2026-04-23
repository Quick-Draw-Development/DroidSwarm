import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer as createNetServer } from 'node:net';
import test from 'node:test';

import { fetchBusEvents, postToBus, startFederationBus, type FederationBusService } from '@federation-bus';
import type { EnvelopeV2 } from '@shared-types';

import { DroidSwarmSocketServer } from './server';
import type { MessageEnvelope, PersistencePort, ServerConfig } from './types';

const services: FederationBusService[] = [];

const canBindLocalPort = async (): Promise<boolean> =>
  await new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });

const reservePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve local port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });

const createConfig = async (overrides: Partial<ServerConfig> = {}): Promise<ServerConfig> => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socket-server-federation-'));
  return {
    host: '127.0.0.1',
    port: await reservePort(),
    projectId: 'project-direct',
    projectName: 'Direct Federation Test',
    dbPath: path.join(tempDir, 'socket-server.sqlite'),
    debug: false,
    swarmId: 'swarm-direct',
    authTimeoutMs: 1_000,
    heartbeatTimeoutMs: 5_000,
    maxMessagesPerWindow: 10,
    messageWindowMs: 1_000,
    federationEnabled: true,
    federationNodeId: 'node-local',
    federationPollMs: 50,
    environment: 'test',
    ...overrides,
  };
};

const createFakePersistence = () => {
  const ensuredChannels: Array<{ channelId: string; projectId: string; taskId?: string }> = [];
  const recordedMessages: MessageEnvelope[] = [];

  const persistence: PersistencePort = {
    migrate: () => undefined,
    ensureChannel: (input) => {
      ensuredChannels.push({ channelId: input.channelId, projectId: input.projectId, taskId: input.taskId });
    },
    recordConnectionOpened: () => undefined,
    recordConnectionAuth: () => undefined,
    recordConnectionClosed: () => undefined,
    recordMessage: (message) => {
      recordedMessages.push(message);
    },
    recordTaskEvent: () => undefined,
    recordAuditEvent: () => undefined,
    close: () => undefined,
  };

  return {
    persistence,
    ensuredChannels,
    recordedMessages,
  };
};

const createFakeRoomManager = () => {
  const broadcasts: Array<{ roomId: string; message: MessageEnvelope }> = [];
  return {
    roomManager: {
      broadcast: (roomId: string, message: MessageEnvelope) => {
        broadcasts.push({ roomId, message });
      },
    },
    broadcasts,
  };
};

const setTestSeams = (
  server: DroidSwarmSocketServer,
  persistence: PersistencePort,
  roomManager: { broadcast(roomId: string, message: MessageEnvelope): void },
): void => {
  const internalServer = server as any;
  internalServer.persistence.close();
  internalServer.persistence = persistence;
  internalServer.roomManager = roomManager;
  internalServer.logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
};

test.afterEach(async () => {
  while (services.length > 0) {
    await services.pop()?.close();
  }
});

test('socket server publishes local messages to the direct federation bus', async (t) => {
  if (!await canBindLocalPort()) {
    t.skip('Local port binding is not permitted in this environment.');
    return;
  }

  const busPort = await reservePort();
  const adminPort = await reservePort();
  const bus = startFederationBus({
    nodeId: 'node-bus',
    host: '127.0.0.1',
    busPort,
    adminPort,
    debug: false,
  });
  services.push(bus);

  const server = new DroidSwarmSocketServer(await createConfig({
    federationBusUrl: `http://127.0.0.1:${busPort}`,
  }));
  const fakePersistence = createFakePersistence();
  const fakeRoomManager = createFakeRoomManager();
  setTestSeams(server, fakePersistence.persistence, fakeRoomManager.roomManager);

  await (server as any).publishToFederation({
    message_id: 'msg-publish-1',
    project_id: 'project-direct',
    room_id: 'task-42',
    type: 'chat',
    verb: 'chat.message',
    timestamp: '2026-04-22T13:00:00.000Z',
    payload: {
      content: 'hello direct federation',
    },
    body: {
      content: 'hello direct federation',
    },
    from: {
      actor_type: 'agent',
      actor_id: 'agent-1',
      actor_name: 'Planner-Alpha',
    },
  });

  const events = await fetchBusEvents(`http://127.0.0.1:${busPort}`);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0]?.sourceNodeId, 'node-local');
  assert.deepEqual(events.events[0]?.envelope, {
    id: 'msg-publish-1',
    ts: '2026-04-22T13:00:00.000Z',
    project_id: 'project-direct',
    swarm_id: 'swarm-direct',
    room_id: 'task-42',
    agent_id: 'agent-1',
    verb: 'chat.message',
    body: {
      content: 'hello direct federation',
    },
  });
});

test('socket server relays remote direct federation envelopes into local rooms only once', async (t) => {
  if (!await canBindLocalPort()) {
    t.skip('Local port binding is not permitted in this environment.');
    return;
  }

  const busPort = await reservePort();
  const adminPort = await reservePort();
  const bus = startFederationBus({
    nodeId: 'node-bus',
    host: '127.0.0.1',
    busPort,
    adminPort,
    debug: false,
  });
  services.push(bus);

  const server = new DroidSwarmSocketServer(await createConfig({
    federationBusUrl: `http://127.0.0.1:${busPort}`,
  }));
  const fakePersistence = createFakePersistence();
  const fakeRoomManager = createFakeRoomManager();
  setTestSeams(server, fakePersistence.persistence, fakeRoomManager.roomManager);

  const remoteEnvelope: EnvelopeV2 = {
    id: 'fed-remote-1',
    ts: '2026-04-22T13:05:00.000Z',
    project_id: 'project-direct',
    swarm_id: 'swarm-remote',
    room_id: 'task-99',
    agent_id: 'agent-remote',
    role: 'planner',
    verb: 'chat.message',
    body: {
      content: 'remote federation message',
    },
  };
  const localEnvelope: EnvelopeV2 = {
    ...remoteEnvelope,
    id: 'fed-local-1',
    body: {
      content: 'loopback should be ignored',
    },
  };

  await postToBus(`http://127.0.0.1:${busPort}`, {
    sourceNodeId: 'node-remote',
    envelope: remoteEnvelope,
  });
  await postToBus(`http://127.0.0.1:${busPort}`, {
    sourceNodeId: 'node-local',
    envelope: localEnvelope,
  });

  await (server as any).pollFederationBus();

  assert.deepEqual(
    fakePersistence.recordedMessages.map((message) => message.message_id),
    ['fed-remote-1'],
  );
  assert.deepEqual(
    fakeRoomManager.broadcasts.map(({ roomId, message }) => [roomId, message.message_id]),
    [['task-99', 'fed-remote-1']],
  );
  assert.deepEqual(fakePersistence.ensuredChannels, [{ channelId: 'task-99', projectId: 'project-direct', taskId: undefined }]);
});
