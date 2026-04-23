import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSlackBotRuntimeConfig } from './config';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('reports disabled when slack bot flag is absent', () => {
  delete process.env.DROIDSWARM_ENABLE_SLACK_BOT;
  delete process.env.DROIDSWARM_SLACK_BOT_TOKEN;
  delete process.env.DROIDSWARM_SLACK_APP_TOKEN;

  const config = loadSlackBotRuntimeConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.missingReason, null);
});

test('reports missing token reason when enabled without credentials', () => {
  process.env.DROIDSWARM_ENABLE_SLACK_BOT = '1';
  delete process.env.DROIDSWARM_SLACK_BOT_TOKEN;
  delete process.env.DROIDSWARM_SLACK_APP_TOKEN;

  const config = loadSlackBotRuntimeConfig();
  assert.equal(config.enabled, true);
  assert.match(config.missingReason ?? '', /Missing Slack bot token/);
});

test('loads env-backed credentials when enabled', () => {
  process.env.DROIDSWARM_ENABLE_SLACK_BOT = '1';
  process.env.DROIDSWARM_SLACK_BOT_TOKEN = 'xoxb-test';
  process.env.DROIDSWARM_SLACK_APP_TOKEN = 'xapp-test';
  process.env.DROIDSWARM_SLACK_LOG_LEVEL = 'debug';
  process.env.DROIDSWARM_OPERATOR_TOKEN = 'operator-secret';
  process.env.DROIDSWARM_PROJECT_ID = 'demo-project';
  process.env.DROIDSWARM_MLX_ENABLED = '1';

  const config = loadSlackBotRuntimeConfig();
  assert.equal(config.botToken, 'xoxb-test');
  assert.equal(config.appToken, 'xapp-test');
  assert.equal(config.operatorToken, 'operator-secret');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.defaultProjectId, 'demo-project');
  assert.equal(config.mlxAvailable, true);
  assert.equal(config.missingReason, null);
});
