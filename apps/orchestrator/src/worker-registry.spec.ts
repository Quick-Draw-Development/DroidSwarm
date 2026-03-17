import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WorkerRegistry } from './worker-registry';

describe('WorkerRegistry', () => {
  it('tracks active agents per task', () => {
    const registry = new WorkerRegistry();
    registry.register({
      taskId: 'task-1',
      title: 'Add login',
      description: 'Implement login flow',
      taskType: 'feature',
      priority: 'high',
      createdAt: '2026-03-12T12:00:00.000Z',
    });

    registry.assignAgents('task-1', ['Planner-01', 'Coder-01']);

    assert.deepEqual(registry.getState('task-1').activeAgents, ['Planner-01', 'Coder-01']);
  });

  it('clears agents when task is cancelled', () => {
    const registry = new WorkerRegistry();
    registry.register({
      taskId: 'task-1',
      title: 'Add login',
      description: 'Implement login flow',
      taskType: 'feature',
      priority: 'high',
      createdAt: '2026-03-12T12:00:00.000Z',
    });
    registry.assignAgents('task-1', ['Planner-01', 'Coder-01']);

    const removed = registry.clearAgents('task-1');

    assert.deepEqual(removed, ['Planner-01', 'Coder-01']);
    assert.deepEqual(registry.getActiveAgents('task-1'), []);
  });

  it('removes a single agent when they exit', () => {
    const registry = new WorkerRegistry();
    registry.register({
      taskId: 'task-2',
      title: 'Investigate bug',
      description: 'Bug triage',
      taskType: 'bug',
      priority: 'medium',
      createdAt: '2026-03-12T12:05:00.000Z',
    });
    registry.assignAgents('task-2', ['Planner-01', 'Coder-02']);

    registry.removeAgent('task-2', 'Planner-01');

    assert.deepEqual(registry.getActiveAgents('task-2'), ['Coder-02']);
  });
});
