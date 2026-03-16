import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseOperatorIntent } from './operator-intents';

describe('operator intents', () => {
  it('categorizes notes when no keywords found', () => {
    const intent = parseOperatorIntent('Let me know when this is ready');
    assert.equal(intent.category, 'note');
  });

  it('detects cancel commands', () => {
    const intent = parseOperatorIntent('Please cancel task abc123');
    assert.equal(intent.category, 'command');
    assert.equal(intent.action.type, 'cancel_task');
    assert.equal(intent.action.taskId, 'abc123');
  });

  it('detects review keywords', () => {
    const intent = parseOperatorIntent('Request a review for task X');
    assert.equal(intent.category, 'command');
    assert.equal(intent.action.type, 'request_review');
  });

  it('detects reprioritize priority levels', () => {
    const intent = parseOperatorIntent('Make task xyz urgent priority');
    assert.equal(intent.category, 'command');
    assert.equal(intent.action.type, 'reprioritize');
    assert.equal(intent.action.priority, 'urgent');
  });
});
