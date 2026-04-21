import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuthMessage, parseCanonicalEnvelope, parseIncomingEnvelope, parseMessageEnvelope } from './validate';

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

test('parseCanonicalEnvelope preserves native EnvelopeV2 payloads', () => {
  const parsed = parseCanonicalEnvelope(JSON.stringify({
    id: 'env-1',
    ts: '2026-03-12T12:00:00.000Z',
    project_id: 'droidswarm',
    room_id: 'task-1',
    task_id: 'task-1',
    agent_id: 'planner-1',
    role: 'planner',
    verb: 'plan.proposed',
    body: {
      task_id: 'task-1',
      summary: 'native envelope',
    },
  }));

  assert.equal(parsed.id, 'env-1');
  assert.equal(parsed.verb, 'plan.proposed');
  assert.deepEqual(parsed.body, {
    task_id: 'task-1',
    summary: 'native envelope',
  });
});

test('parseIncomingEnvelope returns both canonical and legacy-compatible views', () => {
  const parsed = parseIncomingEnvelope(JSON.stringify({
    message_id: 'msg-3',
    project_id: 'droidswarm',
    room_id: 'task-1',
    type: 'spawn_approved',
    from: {
      actor_type: 'orchestrator',
      actor_id: 'orch-1',
      actor_name: 'orchestrator',
    },
    timestamp: '2026-03-12T12:00:00.000Z',
    payload: {
      task_id: 'task-1',
      approved_agents: [],
      summary: 'spawn approved',
    },
  }));

  assert.equal(parsed.canonical.verb, 'spawn.approved');
  assert.equal(parsed.message.type, 'spawn_approved');
  assert.equal(parsed.message.verb, 'spawn.approved');
});
