import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TaskRegistry } from './task-registry';

describe('TaskRegistry', () => {
  it('registers a task and tracks assigned agents', () => {
    const registry = new TaskRegistry();
    registry.register({
      taskId: 'task-1',
      title: 'Add login',
      description: 'Implement login flow',
      taskType: 'feature',
      priority: 'high',
      createdAt: '2026-03-12T12:00:00.000Z',
    });

    registry.assignAgents('task-1', ['Planner-01', 'Coder-01']);

    assert.deepEqual(registry.get('task-1')?.activeAgents, ['Planner-01', 'Coder-01']);
    assert.equal(registry.get('task-1')?.task.title, 'Add login');
  });

  it('cancels a task and removes active agents', () => {
    const registry = new TaskRegistry();
    registry.register({
      taskId: 'task-1',
      title: 'Add login',
      description: 'Implement login flow',
      taskType: 'feature',
      priority: 'high',
      createdAt: '2026-03-12T12:00:00.000Z',
    });
    registry.assignAgents('task-1', ['Planner-01', 'Coder-01']);

    const removed = registry.cancel('task-1', '2026-03-12T12:05:00.000Z');

    assert.deepEqual(removed, ['Planner-01', 'Coder-01']);
    assert.deepEqual(registry.get('task-1')?.activeAgents, []);
    assert.equal(registry.get('task-1')?.status, 'cancelled');
  });
});
