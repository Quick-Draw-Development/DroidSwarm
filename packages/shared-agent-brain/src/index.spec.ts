import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runBrainDreamCycle } from './auto-dream';
import { ensureAgentBrainLayout } from './layout';
import { searchBrainMemories } from './memory-search';
import { getBrainStatus, listBrainPromotionCandidates, reviewBrainPromotionCandidate, writeBrainMemoryEntry } from './memory-store';
import { buildSkillDisclosureIndex, findSkillsForTrigger, listSkillRewriteCandidates, recordSkillUsageOutcome } from './skills';

const withTemporaryDroidSwarmHome = (callback: () => void): void => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-brain-home-'));
  const previousHome = process.env.HOME;
  const previousDroidSwarmHome = process.env.DROIDSWARM_HOME;
  process.env.HOME = tempHome;
  process.env.DROIDSWARM_HOME = path.resolve(tempHome, '.droidswarm');
  try {
    callback();
  } finally {
    if (previousHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousDroidSwarmHome == null) {
      delete process.env.DROIDSWARM_HOME;
    } else {
      process.env.DROIDSWARM_HOME = previousDroidSwarmHome;
    }
  }
};

test('creates the portable .agent brain layout', () => {
  withTemporaryDroidSwarmHome(() => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-brain-layout-'));
    const layout = ensureAgentBrainLayout({ projectRoot, projectId: 'demo' });
    assert.equal(fs.existsSync(path.resolve(layout.root, 'AGENTS.md')), true);
    assert.equal(fs.existsSync(path.resolve(layout.personalDir, 'PREFERENCES.md')), true);
    assert.equal(getBrainStatus({ projectRoot }).root, layout.root);
  });
});

test('writes, searches, and graduates portable brain memories', () => {
  withTemporaryDroidSwarmHome(() => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-brain-memory-'));
    writeBrainMemoryEntry({
      projectRoot,
      projectId: 'demo',
      layer: 'episodic',
      title: 'Retry review automation',
      droidspeak: 'summary.emitted',
      content: 'Review automation failed twice on flaky verification.',
      tags: ['review', 'failure'],
    });
    writeBrainMemoryEntry({
      projectRoot,
      projectId: 'demo',
      layer: 'episodic',
      title: 'Retry review automation again',
      droidspeak: 'summary.emitted',
      content: 'Review automation failed again and needs stabilization.',
      tags: ['review', 'failure'],
    });
    const results = searchBrainMemories({
      projectRoot,
      projectId: 'demo',
      query: 'review automation failed',
    });
    assert.equal(results.length > 0, true);
    const dream = runBrainDreamCycle({ projectRoot, projectId: 'demo' });
    assert.equal(dream.candidateCount, 1);
    const candidate = listBrainPromotionCandidates({ projectRoot, projectId: 'demo' })[0];
    assert.ok(candidate);
    const reviewed = reviewBrainPromotionCandidate({
      projectRoot,
      projectId: 'demo',
      candidateId: candidate.candidateId,
      action: 'graduate',
      rationale: 'Durable lesson approved for future recall.',
      reviewedBy: 'tester',
    });
    assert.equal(reviewed.status, 'graduated');
  });
});

test('builds progressive disclosure indexes and surfaces rewrite candidates', () => {
  withTemporaryDroidSwarmHome(() => {
    const skillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-brain-skills-'));
    buildSkillDisclosureIndex({
      skillsRoot,
      manifests: [
        {
          name: 'code-review-agent',
          description: 'Review diffs and findings.',
          capabilities: ['review', 'code'],
          requiredBackends: ['openmythos'],
          modelPreferences: { tags: ['review'] },
          selfRewriteHooks: [{ pattern: 'review', threshold: 3, windowDays: 14 }],
        },
      ],
    });
    recordSkillUsageOutcome({
      skillsRoot,
      skillName: 'code-review-agent',
      outcome: 'failure',
      detail: 'review automation failed to stabilize findings',
    });
    recordSkillUsageOutcome({
      skillsRoot,
      skillName: 'code-review-agent',
      outcome: 'failure',
      detail: 'review automation failed after verification drift',
    });
    recordSkillUsageOutcome({
      skillsRoot,
      skillName: 'code-review-agent',
      outcome: 'failure',
      detail: 'review automation failed again',
    });
    assert.equal(findSkillsForTrigger(skillsRoot, 'need review follow up').length, 1);
    assert.equal(listSkillRewriteCandidates({ skillsRoot }).length, 1);
  });
});
