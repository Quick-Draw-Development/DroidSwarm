import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFederationBundleManifest,
  buildFederationRemoteWorkerRecord,
  createAdbOnboardingPlan,
  parseAdbDevicesOutput,
} from './index';

describe('federation adb helpers', () => {
  it('parses adb devices output', () => {
    const devices = parseAdbDevicesOutput(`
List of devices attached
emulator-5554 device product:sdk_gphone model:Pixel_8 device:emu transport_id:1
R58M123456 unauthorized usb:1-1 transport_id:3
ZX1G22 offline transport_id:4
`);

    assert.equal(devices.length, 3);
    assert.deepEqual(devices[0], {
      serial: 'emulator-5554',
      state: 'device',
      product: 'sdk_gphone',
      model: 'Pixel_8',
      device: 'emu',
      transportId: '1',
    });
    assert.equal(devices[1]?.state, 'unauthorized');
    assert.equal(devices[2]?.state, 'offline');
  });

  it('builds onboarding manifest and push plan', () => {
    const manifest = buildFederationBundleManifest({
      projectId: 'project-1',
      swarmId: 'swarm-1',
      nodeId: 'node-a',
      busUrl: 'http://127.0.0.1:4947',
      adminUrl: 'http://127.0.0.1:4950',
      runtimeArchivePath: '/tmp/runtime.tgz',
    });
    assert.equal(manifest.version, 1);
    assert.equal(manifest.nodeId, 'node-a');

    const plan = createAdbOnboardingPlan({
      serial: 'emulator-5554',
      manifestPath: '/tmp/federation/manifest.json',
    });
    assert.equal(plan.serial, 'emulator-5554');
    assert.equal(plan.commands.length, 3);
    assert.match(plan.commands[1]!, /adb -s emulator-5554 push/);
    assert.match(plan.commands[2]!, /tar -xzf/);
  });

  it('builds a reusable remote worker record', () => {
    const record = buildFederationRemoteWorkerRecord({
      serial: 'emulator-5554',
      nodeId: 'android-node-1',
      roles: ['planner'],
      engines: ['codex-cli'],
    });

    assert.equal(record.targetId, 'adb-emulator-5554');
    assert.equal(record.remoteEntry, '/sdcard/Android/data/com.droidswarm/files/federation/runtime/orchestrator/main.js');
    assert.deepEqual(record.roles, ['planner']);
    assert.deepEqual(record.engines, ['codex-cli']);
  });
});
