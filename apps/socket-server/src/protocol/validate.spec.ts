import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuthMessage, parseMessageEnvelope } from './validate';

test('parseAuthMessage accepts valid auth payloads', () => {
  const parsed = parseAuthMessage(JSON.stringify({
    type: 'auth',
    project_id: 'droidswarm',
    timestamp: '2026-03-12T12:00:00.000Z',
    payload: {
      room_id: 'operator',
      agent_name: 'Orchestrator',
      agent_role: 'orchestrator',
      client_type: 'orchestrator',
      token: 'secret',
    },
  }));

  assert.equal(parsed.payload.room_id, 'operator');
  assert.equal(parsed.payload.client_type, 'orchestrator');
});

test('parseMessageEnvelope rejects missing actor refs', () => {
  assert.throws(() => parseMessageEnvelope(JSON.stringify({
    message_id: 'msg-1',
    project_id: 'droidswarm',
    room_id: 'task-1',
    type: 'status_update',
    timestamp: '2026-03-12T12:00:00.000Z',
    payload: {},
  })));
});

test('parseMessageEnvelope normalizes EnvelopeV2 compatibility fields', () => {
  const parsed = parseMessageEnvelope(JSON.stringify({
    message_id: 'msg-2',
    project_id: 'droidswarm',
    room_id: 'task-1',
    type: 'plan_proposed',
    from: {
      actor_type: 'agent',
      actor_id: 'planner-1',
      actor_name: 'planner',
    },
    timestamp: '2026-03-12T12:00:00.000Z',
    payload: {
      task_id: 'task-1',
      plan_id: 'plan-1',
      summary: 'plan ready',
    },
  }));

  assert.equal(parsed.id, 'msg-2');
  assert.equal(parsed.ts, '2026-03-12T12:00:00.000Z');
  assert.equal(parsed.verb, 'plan.proposed');
  assert.deepEqual(parsed.body, {
    task_id: 'task-1',
    plan_id: 'plan-1',
    summary: 'plan ready',
  });
});
