import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
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

test('returns governance status and supports human override from slack commands', async () => {
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
    text: 'law propose Require operator confirmation for drift alerts.',
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

  const status = await handleSlackInput({
    text: 'law status',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(status.text, /Governance status/i);
  assert.match(status.text, /consensus rounds/i);

  const overridden = await handleSlackInput({
    text: `override ${proposalId}`,
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(overridden.text, /overridden and activated/i);
});

test('runs a code review from slack commands', async () => {
  const home = makeTempHome();
  const repoRoot = path.join(home, 'repo');
  process.env.DROIDSWARM_HOME = home;
  fs.mkdirSync(repoRoot, { recursive: true });
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: repoRoot,
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });
  fs.writeFileSync(path.join(repoRoot, 'app.ts'), 'export const value = 1;\n');
  execSync('git init -b main', { cwd: repoRoot });
  execSync('git config user.email test@example.com', { cwd: repoRoot });
  execSync('git config user.name Tester', { cwd: repoRoot });
  execSync('git add .', { cwd: repoRoot });
  execSync('git commit -m initial', { cwd: repoRoot });
  execSync('git checkout -b feature/review', { cwd: repoRoot });
  fs.writeFileSync(path.join(repoRoot, 'app.ts'), 'export const value: any = 1;\n');
  execSync('git add app.ts', { cwd: repoRoot });
  execSync('git commit -m update', { cwd: repoRoot });

  const result = await handleSlackInput({
    text: 'review HEAD',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(result.text, /finished with status/i);
});

test('lists and refreshes models from slack commands', async () => {
  const home = makeTempHome();
  const modelsDir = path.join(home, 'models');
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_MODELS_DIR = modelsDir;
  process.env.DROIDSWARM_LLAMA_MODELS_FILE = path.join(modelsDir, 'inventory.json');
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.writeFileSync(path.join(modelsDir, 'qwen2.5-coder-14b-16k-q4_k_m.gguf'), 'model');
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const refreshed = await handleSlackInput({
    text: 'models refresh',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(refreshed.text, /Model inventory refreshed/i);

  const listed = await handleSlackInput({
    text: 'models list',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(listed.text, /Model inventory/i);
  assert.match(listed.text, /qwen2\.5-coder-14b/i);
});

test('reports and updates mythos runtime state from slack commands', async () => {
  const home = makeTempHome();
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_ENABLE_MYTHOS = 'true';
  process.env.DROIDSWARM_MYTHOS_BRIDGE_MODE = 'mock';
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const status = await handleSlackInput({
    text: 'mythos status',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(status.text, /OpenMythos/);

  const loops = await handleSlackInput({
    text: 'mythos loops openmythos-local 12',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(loops.text, /loop count set to 12/i);
});

test('creates skill scaffolds and specialized agents from slack commands', async () => {
  const home = makeTempHome();
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_SKILLS_DIR = path.join(home, 'skills');
  onboardProject({
    projectId: 'demo',
    name: 'Demo',
    rootPath: path.join(home, 'repo'),
    dbPath: path.join(home, 'projects', 'demo', 'droidswarm.db'),
    wsPort: 9999,
  });

  const createdSkill = await handleSlackInput({
    text: 'skill create vision research',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(createdSkill.text, /scaffolded and registered/i);

  const createdAgent = await handleSlackInput({
    text: 'agent create vision-agent vision medium',
    userId: 'U1',
    username: 'alice',
    channelId: 'C1',
  }, baseConfig());
  assert.match(createdAgent.text, /registered and activated|registered/i);
});
