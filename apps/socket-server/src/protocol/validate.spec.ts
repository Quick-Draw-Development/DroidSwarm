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
