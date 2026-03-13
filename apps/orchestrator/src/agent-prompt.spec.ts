import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildAgentPrompt } from './agent-prompt';

describe('buildAgentPrompt', () => {
  it('includes task and role context for Codex workers', () => {
    const prompt = buildAgentPrompt({
      agentName: 'Planner-01',
      role: 'planner',
      projectId: 'proj-1',
      projectName: 'Project 1',
      task: {
        taskId: 'task-1',
        title: 'Add login',
        description: 'Implement login flow',
        taskType: 'feature',
        priority: 'high',
        createdAt: '2026-03-12T12:00:00.000Z',
        createdByUserId: 'alice',
      },
    });

    assert.match(prompt, /Planner-01/);
    assert.match(prompt, /task_id: task-1/);
    assert.match(prompt, /Role: planner/);
  });
});
