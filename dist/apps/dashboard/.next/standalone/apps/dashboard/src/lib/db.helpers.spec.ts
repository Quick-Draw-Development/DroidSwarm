import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildTaskGuardrails, buildTaskHandoffs } from './db';

describe('dashboard detail helpers', () => {
  it('builds handoffs from dependencies and plan events', () => {
    const handoffs = buildTaskHandoffs(['dep-1', 'dep-2'], ['Plan X', 'Plan Y']);
    assert.equal(handoffs.length, 4);
    assert.ok(handoffs.includes('Depends on dep-1'));
    assert.ok(handoffs.includes('Plan Y'));
  });

  it('falls back to placeholder when no handoffs exist', () => {
    const handoffs = buildTaskHandoffs([], []);
    assert.deepEqual(handoffs, ['No handoffs recorded for this task yet.']);
  });

  it('constructs guardrails from budgets and operator actions', () => {
    const guardrails = buildTaskGuardrails(false, [
      { detail: 'Side effect limit reached', consumed: 2 },
    ], [
      { actionType: 'cancel_task', detail: 'Operator stopped work' },
    ]);
    assert.ok(guardrails.some((line) => line.includes('Budget:')));
    assert.ok(guardrails.some((line) => line.includes('Operator cancel_task')));
  });

  it('adds clarification notice when requested', () => {
    const guardrails = buildTaskGuardrails(true, [], []);
    assert.equal(guardrails[0], 'Clarification requested by the creator.');
  });

  it('returns fallback guardrail when no data is available', () => {
    const guardrails = buildTaskGuardrails(false, [], []);
    assert.deepEqual(guardrails, ['No guardrail events recorded yet.']);
  });
});
