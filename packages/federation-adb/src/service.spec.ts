import * as assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { afterEach, describe, it } from 'node:test';

import { buildFederationBundleManifest, createAdbOnboardingPlan, writeFederationBundleManifest } from './index';
import { startAdbSupervisor } from './service';

const servers: Array<{ close(callback: (error?: Error) => void): void }> = [];
const environmentKeys = [
  'DROIDSWARM_FEDERATION_ADB_HOST',
  'DROIDSWARM_FEDERATION_ADB_PORT',
  'DROIDSWARM_FEDERATION_ADB_BIN',
] as const;

const savedEnvironment = new Map<string, string | undefined>();

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

const closeServer = async (server: { close(callback: (error?: Error) => void): void }): Promise<void> =>
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await closeServer(server);
    }
  }

  for (const key of environmentKeys) {
    const prior = savedEnvironment.get(key);
    if (prior == null) {
      delete process.env[key];
    } else {
      process.env[key] = prior;
    }
    savedEnvironment.delete(key);
  }
});

describe('federation adb supervisor scaffolding', () => {
  it('serves adb device inventory through the HTTP supervisor', async (t) => {
    if (!await canBindLocalPort()) {
      t.skip('Local port binding is not permitted in this environment.');
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'federation-adb-supervisor-'));
    const adbPath = path.join(tempDir, 'adb');
    fs.writeFileSync(
      adbPath,
      [
        '#!/bin/sh',
        'printf \'List of devices attached\\n\'',
        'printf \'emulator-5554 device product:sdk_gphone model:Pixel_8 device:emu transport_id:1\\n\'',
        'printf \'ZX1G22 offline transport_id:4\\n\'',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.chmodSync(adbPath, 0o755);

    const port = await reservePort();
    for (const key of environmentKeys) {
      savedEnvironment.set(key, process.env[key]);
    }
    process.env.DROIDSWARM_FEDERATION_ADB_HOST = '127.0.0.1';
    process.env.DROIDSWARM_FEDERATION_ADB_PORT = String(port);
    process.env.DROIDSWARM_FEDERATION_ADB_BIN = adbPath;

    const server = startAdbSupervisor();
    servers.push(server);

    const response = await fetch(`http://127.0.0.1:${port}`);
    assert.equal(response.status, 200);

    const payload = await response.json() as {
      adbBin: string;
      deviceCount: number;
      devices: Array<{ serial: string; state: string }>;
    };
    assert.equal(payload.adbBin, adbPath);
    assert.equal(payload.deviceCount, 2);
    assert.deepEqual(payload.devices.map((device) => `${device.serial}:${device.state}`), [
      'emulator-5554:device',
      'ZX1G22:offline',
    ]);
  });

  it('writes per-device bundle manifests for scale validation fixtures', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'federation-adb-manifests-'));
    const serials = ['emulator-5554', 'emulator-5556', 'R58M123456', 'ZX1G22'];

    for (const serial of serials) {
      const manifestPath = path.join(tempDir, serial, 'manifest.json');
      const manifest = buildFederationBundleManifest({
        projectId: 'project-scale',
        swarmId: 'swarm-scale',
        nodeId: `node-${serial}`,
        busUrl: 'http://127.0.0.1:4947',
        adminUrl: 'http://127.0.0.1:4950',
        metadata: {
          serial,
        },
      });
      writeFederationBundleManifest(manifestPath, manifest);

      const written = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        nodeId: string;
        metadata?: { serial?: string };
      };
      const plan = createAdbOnboardingPlan({
        serial,
        manifestPath,
      });

      assert.equal(written.nodeId, `node-${serial}`);
      assert.equal(written.metadata?.serial, serial);
      assert.equal(plan.serial, serial);
      assert.match(plan.commands[1]!, new RegExp(`${serial.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')} push`));
      assert.match(plan.commands[1]!, /manifest\.json$/);
    }
  });
});
