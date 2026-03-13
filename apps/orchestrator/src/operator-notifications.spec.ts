import { describe, it } from 'node:test';
import assert from 'node:assert';

import { formatAgentAssignmentContent, formatAgentRequestContent, buildReviewAnnouncement } from './operator-notifications';

describe('operator-notifications', () => {
  it('formats assignment content', () => {
    const agents = [
      { agentName: 'Planner-01', taskId: 'task-1', role: 'planner' },
      { agentName: 'Coder-02', taskId: 'task-1', role: 'coder' },
    ];

    const content = formatAgentAssignmentContent(agents as any);
    assert.strictEqual(content, 'Assigned agents: Planner-01 (planner), Coder-02 (coder).');
  });

  it('handles zero assignments', () => {
    assert.strictEqual(formatAgentAssignmentContent([]), 'Assigned agents: none.');
  });

  it('formats request content', () => {
    const requests = [
      { role: 'architect', reason: 'design', instructions: '' },
      { role: 'tester', reason: 'qa', instructions: '' },
    ];

    const content = formatAgentRequestContent('Planner-01', requests as any);
    assert.strictEqual(content, 'Planner-01 requested additional agents: architect (design), tester (qa)');
  });

  it('handles empty request list', () => {
    assert.strictEqual(formatAgentRequestContent('Planner-01', []), 'Planner-01 requested additional agents: none.');
  });

  it('builds review announcement', () => {
    assert.strictEqual(buildReviewAnnouncement('birk_dv'), 'birk_dv is reviewing this task.');
  });
});
