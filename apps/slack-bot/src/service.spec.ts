import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

import { onboardProject } from '@shared-projects';

import { handleSlackInput, resetSlackSessionMemory } from './service';
import type { SlackBotRuntimeConfig } from './config';

const ORIGINAL_ENV = { ...process.env };

class FakeSocket extends EventEmitter {
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit('close');
  }

  terminate(): void {
    this.emit('close');
  }
}

const makeTempHome = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-slack-bot-'));

const baseConfig = (): SlackBotRuntimeConfig => ({
  enabled: true,
  governanceEnabled: true,
  botToken: 'xoxb-test',
  appToken: 'xapp-test',
  operatorToken: 'operator-token',
  keychainService: 'droidswarm-slack',
  logLevel: 'info',
  missingReason: null,
  defaultProjectId: 'demo',
  preferAppleIntelligence: true,
  appleRuntimeAvailable: true,
  mlxAvailable: true,
});

test.beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetSlackSessionMemory();
});

test.after(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('supports project selection and project listing', async () => {
  const home = makeTempHome();
  process.env.DROIDSWARM_HOME = home;
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const selected = await handleSlackInput({
    text: 'use demo',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(selected.text, /targets \*Demo\*/);

  const listed = await handleSlackInput({
    text: 'projects',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(listed.text, /Demo `demo`/);
});

test('forwards operator messages into the operator room and mirrors responses back to slack', async () => {
  const home = makeTempHome();
  process.env.DROIDSWARM_HOME = home;
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const socket = new FakeSocket();
  const posted: Array<{ channelId: string; text: string; threadTs?: string }> = [];

  const result = await handleSlackInput({
    text: 'please review the current blocker',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig(), {
    socketFactory: () => socket,
    dispatchMessage: async () => 'accepted',
    postSlackMessage: async (input) => {
      posted.push(input);
      return { ts: '111.222' };
    },
  });

  assert.match(result.text, /Forwarded to the orchestrator/);
  socket.emit('open');
  assert.match(socket.sent[0] ?? '', /"room_id":"operator"/);
  socket.emit('message', JSON.stringify({
    type: 'status_update',
    payload: { content: 'Authenticated slack-operator' },
  }));
  assert.match(socket.sent[1] ?? '', /"type":"chat"/);
  assert.match(socket.sent[1] ?? '', /please review the current blocker/);

  socket.emit('message', JSON.stringify({
    message_id: 'm-1',
    type: 'chat',
    from: { actor_type: 'orchestrator', actor_name: 'orchestrator' },
    payload: { content: 'I am looking into it.' },
  }));
  assert.equal(posted.length, 1);
  assert.match(posted[0]?.text ?? '', /looking into it/);
  assert.equal(posted[0]?.channelId, 'C1');
});

test('forwards task-room messages and mirrors task replies into the slack thread', async () => {
  const home = makeTempHome();
  process.env.DROIDSWARM_HOME = home;
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const socket = new FakeSocket();
  const posted: Array<{ channelId: string; text: string; threadTs?: string }> = [];

  const result = await handleSlackInput({
    text: 'task-1234abcd: retry with the latest digest',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
    threadTs: '200.300',
  }, baseConfig(), {
    socketFactory: () => socket,
    dispatchMessage: async () => 'accepted',
    postSlackMessage: async (input) => {
      posted.push(input);
      return { ts: '200.301' };
    },
  });

  assert.match(result.text, /Forwarded to task `task-1234abcd`/);
  socket.emit('open');
  assert.match(socket.sent[0] ?? '', /"room_id":"task-1234abcd"/);
  socket.emit('message', JSON.stringify({
    type: 'status_update',
    payload: { content: 'Authenticated slack-task-1234abcd' },
  }));
  assert.match(socket.sent[1] ?? '', /"room_id":"task-1234abcd"/);
  assert.match(socket.sent[1] ?? '', /retry with the latest digest/);

  socket.emit('message', JSON.stringify({
    message_id: 'm-2',
    type: 'status_update',
    from: { actor_type: 'agent', actor_name: 'planner-1' },
    payload: { content: 'is now replanning the task.' },
  }));
  assert.equal(posted.length, 1);
  assert.equal(posted[0]?.threadTs, '200.300');
  assert.match(posted[0]?.text ?? '', /planner-1/);
});

test('creates and approves governance proposals from slack commands', async () => {
  const home = makeTempHome();
  process.env.DROIDSWARM_HOME = home;
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const proposed = await handleSlackInput({
    text: 'law propose Require explicit governance summaries at startup.',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(proposed.text, /pending human approval|rejected/);

  const proposalStorePath = path.join(home, 'governance', 'store.json');
  const payload = JSON.parse(fs.readFileSync(proposalStorePath, 'utf8')) as {
    proposals: Array<{ proposalId: string }>;
  };
  const proposalId = payload.proposals[0]?.proposalId;
  assert.ok(proposalId);

  const approved = await handleSlackInput({
    text: `law approve ${proposalId}`,
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(approved.text, /approved and activated/i);
});
