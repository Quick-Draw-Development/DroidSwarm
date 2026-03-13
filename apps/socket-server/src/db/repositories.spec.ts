import assert from 'node:assert/strict';
import test from 'node:test';

import Database from 'better-sqlite3';

import { applySchema } from './schema';
import { SqlitePersistence } from './repositories';
import type { MessageEnvelope } from '../types';

test('sqlite persistence stores messages and extracted mentions', () => {
  const database = new Database(':memory:');
  applySchema(database);
  const repository = new SqlitePersistence(database);

  repository.ensureChannel({
    channelId: 'task-1',
    projectId: 'droidswarm',
    channelType: 'task',
    name: 'task-1',
    status: 'active',
    createdAt: '2026-03-12T12:00:00.000Z',
    updatedAt: '2026-03-12T12:00:00.000Z',
  });

  const message: MessageEnvelope = {
    message_id: 'msg-1',
    project_id: 'droidswarm',
    room_id: 'task-1',
    task_id: 'task-1',
    type: 'clarification_request',
    from: {
      actor_type: 'orchestrator',
      actor_id: 'orch-1',
      actor_name: 'Orchestrator',
    },
    timestamp: '2026-03-12T12:00:00.000Z',
    payload: {
      question_id: 'q-1',
      target_user_id: 'alice_dev',
      reason_code: 'needs_human_clarification',
      question: 'Which API should be used?',
    },
  };

  repository.recordMessage(message);

  const storedMessage = database.prepare('SELECT message_type FROM messages WHERE message_id = ?').get('msg-1') as { message_type: string } | undefined;
  const storedMention = database.prepare('SELECT mentioned_id FROM message_mentions WHERE message_id = ?').get('msg-1') as { mentioned_id: string } | undefined;

  assert.equal(storedMessage?.message_type, 'clarification_request');
  assert.equal(storedMention?.mentioned_id, 'alice_dev');

  repository.close();
});

test('sqlite persistence stores task events', () => {
  const database = new Database(':memory:');
  applySchema(database);
  const repository = new SqlitePersistence(database);

  repository.recordTaskEvent({
    eventId: 'event-1',
    projectId: 'droidswarm',
    taskId: 'task-1',
    eventType: 'task_created',
    actorType: 'human',
    actorId: 'alice_dev',
    payload: { title: 'Create task' },
    createdAt: '2026-03-12T12:00:00.000Z',
  });

  const storedEvent = database.prepare('SELECT event_type, actor_id FROM task_events WHERE event_id = ?').get('event-1') as { event_type: string; actor_id: string } | undefined;

  assert.equal(storedEvent?.event_type, 'task_created');
  assert.equal(storedEvent?.actor_id, 'alice_dev');

  repository.close();
});
