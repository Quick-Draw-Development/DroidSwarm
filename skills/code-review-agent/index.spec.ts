import test from 'node:test';
import assert from 'node:assert/strict';

test('code review agent scaffold exports the skill marker', async () => {
  const module = await import('./index');
  assert.equal(module.codeReviewAgentSkill.name, 'code-review-agent');
});
