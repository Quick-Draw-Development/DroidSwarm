import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSlackCommand, renderSlackCommandResponse } from './commands';

test('parses supported slash commands', () => {
  assert.equal(parseSlackCommand('status').kind, 'status');
  assert.equal(parseSlackCommand('projects').kind, 'projects');
  assert.equal(parseSlackCommand('agents').kind, 'agents');
  assert.equal(parseSlackCommand('task start demo investigate flakes').kind, 'task-start');
  assert.equal(parseSlackCommand('swarm pause swarm-123').kind, 'swarm-pause');
  assert.equal(parseSlackCommand('swarm resume swarm-123').kind, 'swarm-resume');
});

test('renders help for empty input', () => {
  const response = renderSlackCommandResponse(parseSlackCommand(''));
  assert.match(response.text, /\/droid status/);
});

test('marks unknown commands as unsupported', () => {
  const parsed = parseSlackCommand('launch everything');
  assert.equal(parsed.kind, 'unsupported');
  assert.match(renderSlackCommandResponse(parsed).text, /Unknown command/);
});
