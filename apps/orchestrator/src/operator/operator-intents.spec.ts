import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseOperatorIntent } from './operator-intents';

describe('operator intents', () => {
  it('treats plain text as a note', () => {
    const intent = parseOperatorIntent('Let me know when this is ready');
    assert.equal(intent.category, 'note');
  });

  it('parses /cancel commands with task ids', () => {
    const intent = parseOperatorIntent('/cancel abc123 please stop');
    assert.equal(intent.category, 'command');
    assert.equal(intent.action.type, 'cancel_task');
    assert.equal(intent.action.taskId, 'abc123');
    assert.equal(intent.action.reason, 'please stop');
  });

  it('uses fallback task id when the command omits it', () => {
    const intent = parseOperatorIntent('/review', 'fallback-task');
    assert.equal(intent.category, 'command');
    assert.equal(intent.action.type, 'request_review');
    assert.equal(intent.action.taskId, 'fallback-task');
  });

  it('rejects commands missing required parameters', () => {
    const intent = parseOperatorIntent('/cancel');
    assert.equal(intent.category, 'command_error');
    assert.ok(intent.message.includes('Missing task identifier'));
  });

  it('parses /priority commands with explicit level and reason', () => {
    const intent = parseOperatorIntent('/priority task-42 urgent adjust schedule');
    assert.equal(intent.category, 'command');
    assert.equal(intent.action.type, 'reprioritize');
    assert.equal(intent.action.taskId, 'task-42');
    assert.equal(intent.action.priority, 'urgent');
    assert.equal(intent.action.reason, 'adjust schedule');
  });

  it('rejects priority commands with unknown levels', () => {
    const intent = parseOperatorIntent('/priority task-42 super urgent');
    assert.equal(intent.category, 'command_error');
    assert.ok(intent.message.includes('Priority must be one of'));
  });
});
