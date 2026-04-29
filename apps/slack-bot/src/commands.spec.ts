import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSlackCommand, parseSlackIntent, renderSlackCommandResponse } from './commands';

test('parses supported slash commands', () => {
  assert.equal(parseSlackCommand('projects').kind, 'projects');
  assert.equal(parseSlackCommand('skills list').kind, 'skills-list');
  assert.equal(parseSlackCommand('use demo').kind, 'project-use');
  assert.equal(parseSlackCommand('law status').kind, 'law-status');
  assert.equal(parseSlackCommand('law propose Require audit trail for governance').kind, 'law-propose');
  assert.equal(parseSlackCommand('law approve proposal-123').kind, 'law-approve');
  assert.equal(parseSlackCommand('override proposal-123').kind, 'law-override');
  assert.equal(parseSlackCommand('review feature/test').kind, 'review-run');
  assert.equal(parseSlackCommand('models new').kind, 'models-new');
  assert.equal(parseSlackCommand('models discover').kind, 'models-discover');
  assert.equal(parseSlackCommand('models download qwen-test').kind, 'models-download');
  assert.equal(parseSlackCommand('mythos status').kind, 'mythos-status');
  assert.equal(parseSlackCommand('mythos loops openmythos-local 12').kind, 'mythos-loops');
  assert.equal(parseSlackCommand('skill create vision research').kind, 'skill-create');
  assert.equal(parseSlackCommand('agent create vision-agent vision,reviewer high').kind, 'agent-create');
  assert.equal(parseSlackCommand('task-1234abcd: please retry').kind, 'task-message');
  assert.equal(parseSlackCommand('please check the planner state').kind, 'operator-message');
});

test('renders help for empty input', () => {
  const response = renderSlackCommandResponse(parseSlackCommand(''));
  assert.match(response.text, /forwards a message to the orchestrator/i);
});

test('parses natural language relay intents and project selection', () => {
  const task = parseSlackIntent('task-1234abcd: investigate the dashboard build failure', {
    preferAppleIntelligence: true,
    appleRuntimeAvailable: true,
  });
  assert.equal(task.kind, 'task-message');
  assert.equal(task.taskId, 'task-1234abcd');
  assert.match(task.content ?? '', /dashboard build failure/i);
  assert.equal(task.route.backend, 'apple-intelligence');

  const useProject = parseSlackIntent('switch to project api');
  assert.equal(useProject.kind, 'project-use');
  assert.equal(useProject.projectHint, 'api');

  const status = parseSlackIntent('law status');
  assert.equal(status.kind, 'law-status');

  const review = parseSlackIntent('review feature/test');
  assert.equal(review.kind, 'review-run');

  const modelsNew = parseSlackIntent('models new');
  assert.equal(modelsNew.kind, 'models-new');

  const mythosStatus = parseSlackIntent('mythos status');
  assert.equal(mythosStatus.kind, 'mythos-status');
});

test('defaults arbitrary messages to operator relay', () => {
  const parsed = parseSlackIntent('launch everything');
  assert.equal(parsed.kind, 'operator-message');
  assert.match(renderSlackCommandResponse(parsed).text, /operator room/);
});
