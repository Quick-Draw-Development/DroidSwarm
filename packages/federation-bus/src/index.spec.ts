import * as assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { afterEach, describe, it } from 'node:test';

import { fetchBusEvents, fetchBusStatus, kickPeer, onboardPeer, postToBus, sendHeartbeat, signFederationRequest, startFederationBus, verifyFederationRequest } from './index';

const services: Array<{ close(): Promise<void> }> = [];

const canBindLocalPort = async (): Promise<boolean> =>
  await new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });

afterEach(async () => {
  while (services.length > 0) {
    const service = services.pop();
    if (service) {
      await service.close();
    }
  }
});

describe('federation bus', () => {
  it('signs and verifies federation requests', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const signed = signFederationRequest('heartbeat', {
      peerId: 'node-a',
      busUrl: 'http://127.0.0.1:4947',
      adminUrl: 'http://127.0.0.1:4950',
    }, {
      keyId: 'node-a',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });

    assert.equal(verifyFederationRequest(
      'heartbeat',
      signed.payload,
      signed.signedBy,
      signed.nonce,
      signed.signature,
      {
        keyId: 'node-a',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        enforceVerification: true,
      },
    ), true);
  });

  it('accepts envelopes, tracks peers, and exposes status', async (t) => {
    if (!await canBindLocalPort()) {
      t.skip('Local port binding is not permitted in this environment.');
      return;
    }

    const service = startFederationBus({
      nodeId: 'node-a',
      host: '127.0.0.1',
      busPort: 49471,
      adminPort: 49501,
      debug: false,
    });
    services.push(service);

    await sendHeartbeat('http://127.0.0.1:49471', {
      peerId: 'node-b',
      busUrl: 'http://10.0.0.2:4947',
      adminUrl: 'http://10.0.0.2:4950',
      capabilities: ['envelope-v2'],
    });

    const postResult = await postToBus('http://127.0.0.1:49471', {
      sourceNodeId: 'node-b',
      envelope: {
        id: 'env-1',
        ts: new Date().toISOString(),
        project_id: 'project-1',
        swarm_id: 'swarm-1',
        room_id: 'operator',
        verb: 'chat.message',
        body: {
          content: 'hello federation',
        },
      },
    });
    assert.equal(postResult.accepted, true);

    const status = await fetchBusStatus('http://127.0.0.1:49501');
    assert.equal(status.latestSequence, 1);
    assert.equal(status.peerCount, 1);
    assert.equal(status.projectCount, 1);
    assert.equal(status.recentEventCount, 1);
    assert.equal(status.peers[0]?.peerId, 'node-b');
    assert.deepEqual(status.peers[0]?.projectIds, ['project-1']);
    assert.equal(status.projects[0]?.projectId, 'project-1');
    assert.deepEqual(status.projects[0]?.peers, ['node-b']);

    const events = await fetchBusEvents('http://127.0.0.1:49471');
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0]?.envelope.body.content, 'hello federation');
  });

  it('kicks known peers through the admin port', async (t) => {
    if (!await canBindLocalPort()) {
      t.skip('Local port binding is not permitted in this environment.');
      return;
    }

    const target = startFederationBus({
      nodeId: 'node-b',
      host: '127.0.0.1',
      busPort: 49472,
      adminPort: 49502,
      debug: false,
    });
    const source = startFederationBus({
      nodeId: 'node-a',
      host: '127.0.0.1',
      busPort: 49473,
      adminPort: 49503,
      peerUrls: ['http://127.0.0.1:49472'],
      debug: false,
    });
    services.push(target, source);

    const result = await kickPeer('http://127.0.0.1:49503', {
      peerId: '127.0.0.1:49472',
    });
    assert.equal(result.accepted, true);

    const status = await fetchBusStatus('http://127.0.0.1:49502');
    assert.equal(status.peerCount, 1);
    assert.equal(status.peers[0]?.peerId, 'node-a');
  });

  it('supports explicit onboarding and records continuity drift in status', async (t) => {
    if (!await canBindLocalPort()) {
      t.skip('Local port binding is not permitted in this environment.');
      return;
    }

    const service = startFederationBus({
      nodeId: 'node-a',
      host: '127.0.0.1',
      busPort: 49474,
      adminPort: 49504,
      projectIds: ['project-a'],
      debug: false,
    });
    services.push(service);

    const onboard = await onboardPeer('http://127.0.0.1:49504', {
      peerId: 'node-b',
      busUrl: 'http://10.0.0.3:4947',
      adminUrl: 'http://10.0.0.3:4950',
      projectId: 'project-a',
      capabilities: ['envelope-v2', 'orchestrator'],
    });
    assert.equal(onboard.accepted, true);

    await postToBus('http://127.0.0.1:49474', {
      sourceNodeId: 'node-b',
      envelope: {
        id: 'env-drift-1',
        ts: new Date().toISOString(),
        project_id: 'project-a',
        task_id: 'task-1',
        room_id: 'task-1',
        verb: 'status.updated',
        body: {
          metadata: {
            digestHash: 'digest-a',
            handoffHash: 'handoff-a',
          },
        },
      },
    });

    await postToBus('http://127.0.0.1:49474', {
      sourceNodeId: 'node-c',
      envelope: {
        id: 'env-drift-2',
        ts: new Date().toISOString(),
        project_id: 'project-a',
        task_id: 'task-1',
        room_id: 'task-1',
        verb: 'status.updated',
        body: {
          metadata: {
            digestHash: 'digest-b',
            handoffHash: 'handoff-b',
          },
        },
      },
    });

    const status = await fetchBusStatus('http://127.0.0.1:49504');
    assert.equal(status.peerCount, 1);
    assert.equal(status.peers[0]?.peerId, 'node-b');
    assert.equal(status.projectCount, 1);
    assert.equal(status.projects[0]?.projectId, 'project-a');
    assert.equal(status.recentDriftCount, 1);
    assert.equal(status.counters.onboardingsReceived, 1);
    assert.equal(status.counters.driftsDetected, 1);
    assert.equal(status.recentDrifts[0]?.taskId, 'task-1');
    assert.equal(status.recentDrifts[0]?.projectId, 'project-a');
    assert.equal(status.recentDrifts[0]?.reportedDigestHash, 'digest-b');
    assert.equal(status.recentDrifts[0]?.expectedDigestHash, 'digest-a');
  });
});
