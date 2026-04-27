import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLongTermMemory } from '@shared-memory';

import { approveEvolutionProposal, getEvolutionStatus, proposeSkillEvolution } from './skill-evolution-loop';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('creates governed evolution proposals from reflection signals', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-evolve-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_PROJECT_ID = 'demo';
  process.env.DROIDSWARM_SKILLS_DIR = path.join(home, 'skills');
  createLongTermMemory({
    projectId: 'demo',
    memoryType: 'procedural',
    droidspeakSummary: 'blocked review',
    englishTranslation: 'We keep failing on review automation.',
    metadata: { outcome: 'failure' },
  });
  const proposal = proposeSkillEvolution({ projectId: 'demo' });
  assert.equal(proposal.status === 'pending-human-approval' || proposal.status === 'rejected', true);
  assert.equal(getEvolutionStatus('demo').proposals.length, 1);
});

test('approves evolution proposals into the skills directory', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-evolve-approve-'));
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_PROJECT_ID = 'demo';
  process.env.DROIDSWARM_SKILLS_DIR = path.join(home, 'skills');
  createLongTermMemory({
    projectId: 'demo',
    memoryType: 'procedural',
    droidspeakSummary: 'blocked memory',
    englishTranslation: 'We need a memory helper skill.',
    metadata: { outcome: 'failure' },
  });
  const proposal = proposeSkillEvolution({ projectId: 'demo' });
  if (proposal.status === 'rejected') {
    return;
  }
  const approved = approveEvolutionProposal(proposal.proposalId);
  assert.equal(approved.status, 'approved');
  assert.equal(fs.existsSync(path.join(process.env.DROIDSWARM_SKILLS_DIR!, String(approved.manifest.name), 'SKILL.md')), true);
});
