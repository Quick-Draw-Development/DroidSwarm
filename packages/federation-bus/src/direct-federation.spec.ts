import * as assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { afterEach, describe, it } from 'node:test';

import { fetchBusEvents, fetchBusStatus, postToBus, sendHeartbeat, startFederationBus, type FederationBusService } from './index';

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

const allocateBusPorts = async (): Promise<{ busPort: number; adminPort: number }> => ({
  busPort: await reservePort(),
  adminPort: await reservePort(),
});

afterEach(async () => {
  while (services.length > 0) {
    await services.pop()?.close();
  }
});

describe('direct federation bus scaffolding', () => {
  it('forwards envelopes to direct peers and suppresses duplicates', async (t) => {
    if (!await canBindLocalPort()) {
      t.skip('Local port binding is not permitted in this environment.');
      return;
    }

    const sourcePorts = await allocateBusPorts();
    const targetPorts = await allocateBusPorts();
    const target = startFederationBus({
      nodeId: 'node-target',
      host: '127.0.0.1',
      ...targetPorts,
      debug: false,
    });
    const source = startFederationBus({
      nodeId: 'node-source',
      host: '127.0.0.1',
      ...sourcePorts,
      peerUrls: [`http://127.0.0.1:${targetPorts.busPort}`],
      debug: false,
    });
    services.push(target, source);

    const envelope = {
      id: 'direct-env-1',
      ts: '2026-04-22T12:00:00.000Z',
      project_id: 'project-direct',
      swarm_id: 'swarm-direct',
      room_id: 'operator',
      verb: 'chat.message' as const,
      body: {
        content: 'direct federation envelope',
      },
    };

    const first = await postToBus(`http://127.0.0.1:${sourcePorts.busPort}`, {
      sourceNodeId: 'client-edge',
      envelope,
    });
    const duplicate = await postToBus(`http://127.0.0.1:${sourcePorts.busPort}`, {
      sourceNodeId: 'client-edge',
      envelope,
    });

    assert.equal(first.accepted, true);
    assert.equal(duplicate.duplicate, true);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const events = await fetchBusEvents(`http://127.0.0.1:${targetPorts.busPort}`);
      if (events.events.length === 1) {
        assert.equal(events.events[0]?.sourceNodeId, 'node-source');
        assert.equal(events.events[0]?.envelope.id, 'direct-env-1');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.fail('Expected forwarded envelope to appear on direct federation peer.');
  });

  it('retains only the recent event window during scale validation scaffolding', async (t) => {
    if (!await canBindLocalPort()) {
      t.skip('Local port binding is not permitted in this environment.');
      return;
    }

    const ports = await allocateBusPorts();
    const service = startFederationBus({
      nodeId: 'node-scale',
      host: '127.0.0.1',
      ...ports,
      eventRetentionLimit: 25,
      debug: false,
    });
    services.push(service);

    for (let index = 0; index < 8; index += 1) {
      await sendHeartbeat(`http://127.0.0.1:${ports.busPort}`, {
        peerId: `peer-${index}`,
        busUrl: `http://10.0.0.${index + 10}:4947`,
        adminUrl: `http://10.0.0.${index + 10}:4950`,
        capabilities: ['envelope-v2', 'heartbeat'],
        ts: `2026-04-22T12:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }

    for (let index = 0; index < 30; index += 1) {
      const result = await postToBus(`http://127.0.0.1:${ports.busPort}`, {
        sourceNodeId: `peer-${index % 8}`,
        envelope: {
          id: `scale-env-${index}`,
          ts: `2026-04-22T12:01:${String(index).padStart(2, '0')}.000Z`,
          project_id: 'project-scale',
          swarm_id: 'swarm-scale',
          room_id: `task-${index % 3}`,
          verb: 'chat.message',
          body: {
            index,
          },
        },
      });
      assert.equal(result.accepted, true);
    }

    const status = await fetchBusStatus(`http://127.0.0.1:${ports.adminPort}`);
    assert.equal(status.peerCount, 8);
    assert.equal(status.recentEventCount, 25);
    assert.equal(status.counters.heartbeatsReceived, 8);
    assert.equal(status.counters.envelopesReceived, 30);

    const retained = await fetchBusEvents(`http://127.0.0.1:${ports.busPort}`, 20, 50);
    assert.equal(retained.latestSequence, 30);
    assert.equal(retained.events.length, 10);
    assert.deepEqual(
      retained.events.map((event) => event.sequence),
      [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    );
  });

  for (const envelopeCount of [10, 50, 200]) {
    it(`tracks latest sequence correctly for a ${envelopeCount}-envelope scale window`, async (t) => {
      if (!await canBindLocalPort()) {
        t.skip('Local port binding is not permitted in this environment.');
        return;
      }

      const ports = await allocateBusPorts();
      const service = startFederationBus({
        nodeId: `node-scale-${envelopeCount}`,
        host: '127.0.0.1',
        ...ports,
        eventRetentionLimit: 25,
        debug: false,
      });
      services.push(service);

      const peerCount = Math.min(10, Math.max(2, Math.ceil(envelopeCount / 20)));
      for (let index = 0; index < peerCount; index += 1) {
        await sendHeartbeat(`http://127.0.0.1:${ports.busPort}`, {
          peerId: `peer-${index}`,
          busUrl: `http://10.0.0.${index + 10}:4947`,
          adminUrl: `http://10.0.0.${index + 10}:4950`,
          capabilities: ['envelope-v2', 'heartbeat'],
        });
      }

      for (let index = 0; index < envelopeCount; index += 1) {
        await postToBus(`http://127.0.0.1:${ports.busPort}`, {
          sourceNodeId: `peer-${index % peerCount}`,
          envelope: {
            id: `scale-window-${envelopeCount}-${index}`,
            ts: `2026-04-22T12:03:${String(index % 60).padStart(2, '0')}.000Z`,
            project_id: 'project-scale-window',
            swarm_id: 'swarm-scale-window',
            room_id: `task-${index % 5}`,
            verb: 'chat.message',
            body: { index, envelopeCount },
          },
        });
      }

      const status = await fetchBusStatus(`http://127.0.0.1:${ports.adminPort}`);
      assert.equal(status.counters.envelopesReceived, envelopeCount);
      assert.equal(status.recentEventCount, Math.min(25, envelopeCount));

      const retained = await fetchBusEvents(`http://127.0.0.1:${ports.busPort}`);
      assert.equal(retained.latestSequence, envelopeCount);
      assert.equal(retained.events.length, Math.min(25, envelopeCount));
    });
  }
});
