import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isCancellationMessage, resolveTaskFromMessage, StatusUpdateMessage, TaskRelatedMessage } from './task-events';

const baseMessage: TaskRelatedMessage = {
  message_id: 'msg-1',
  project_id: 'proj-1',
  room_id: 'operator',
  task_id: 'task-1',
  type: 'task_created',
  from: {
    actor_type: 'human',
    actor_id: 'user-1',
    actor_name: 'alice',
  },
  timestamp: '2026-03-12T12:00:00.000Z',
  payload: {
    task_id: 'task-1',
    title: 'Implement login',
    description: 'Build the login flow',
    task_type: 'feature',
    priority: 'high',
    created_by: 'alice',
  },
};

describe('task-events', () => {
  it('resolves task metadata from a task_created message', () => {
    const task = resolveTaskFromMessage(baseMessage);
    assert.equal(task?.taskId, 'task-1');
    assert.equal(task?.title, 'Implement login');
    assert.equal(task?.createdByUserId, 'alice');
  });

  it('detects cancellation messages', () => {
    const cancellationMessage: StatusUpdateMessage = {
      ...baseMessage,
      type: 'status_update',
      payload: {
        phase: 'cancelled',
        status_code: 'task_cancelled',
        content: 'operator cancelled the task',
      },
    };
    assert.equal(isCancellationMessage(cancellationMessage), true);
  });
});
