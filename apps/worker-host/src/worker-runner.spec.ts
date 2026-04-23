import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRemoteShellCommand } from './worker-runner';

describe('worker runner remote shell command', () => {
  it('projects swarm environment into the remote adb shell command', () => {
    const command = buildRemoteShellCommand(
      'node',
      '/remote/runtime/orchestrator/main.js',
      ['worker', '{"taskId":"task-1"}'],
      {
        DROIDSWARM_SOCKET_URL: 'ws://127.0.0.1:8765',
        DROIDSWARM_PROJECT_ID: 'project-1',
        DROIDSWARM_CODEX_API_KEY: 'secret-key',
      },
    );

    assert.match(command, /DROIDSWARM_SOCKET_URL='ws:\/\/127\.0\.0\.1:8765'/);
    assert.match(command, /DROIDSWARM_PROJECT_ID='project-1'/);
    assert.match(command, /DROIDSWARM_CODEX_API_KEY='secret-key'/);
    assert.match(command, /'node' '\/remote\/runtime\/orchestrator\/main\.js' 'worker'/);
  });
});
