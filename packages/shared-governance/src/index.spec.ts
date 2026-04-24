import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  approveLawProposal,
  createLawProposal,
  enforceLaw,
  listActiveLaws,
  listLawProposals,
  rejectLawProposal,
  runGovernanceDebate,
  validateCompliance,
} from './index';

test.beforeEach(() => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-governance-'));
  process.env.DROIDSWARM_HOME = home;
});

test('enforces built-in laws for governance events', () => {
  const law = enforceLaw('LAW-001', {
    eventType: 'governance.proposal',
    projectId: 'demo',
    auditLoggingEnabled: true,
  });
  assert.equal(law.ok, false);
  assert.match(law.violations[0] ?? '', /Droidspeak/i);
});

test('runs debate rounds and leaves compliant proposals pending human approval', () => {
  const result = runGovernanceDebate({
    lawId: 'LAW-006',
    title: 'Require governance summary on startup',
    description: 'Require every startup path to emit a governance summary.',
    rationale: 'Improves observability.',
    glyph: 'EVT-LAW-PROPOSAL',
    proposedBy: 'tester',
    context: {
      eventType: 'governance.proposal',
      actorRole: 'planner',
      swarmRole: 'master',
      projectId: 'demo',
      auditLoggingEnabled: true,
      dashboardEnabled: false,
      droidspeakState: { compact: 'EVT-LAW-PROPOSAL', expanded: 'proposal', kind: 'memory_pinned' },
    },
  });

  assert.equal(result.status, 'pending-human-approval');
  assert.equal(result.rounds.length, 3);
  assert.equal(listLawProposals().length, 1);
});

test('approves proposals and appends them to SYSTEM_LAWS.md', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-governance-root-'));
  fs.writeFileSync(path.join(rootDir, 'SYSTEM_LAWS.md'), '# SYSTEM_LAWS\n');

  const proposal = createLawProposal({
    lawId: 'LAW-006',
    title: 'Test law',
    description: 'A test law.',
    rationale: 'Needed for validation.',
    glyph: 'EVT-LAW-PROPOSAL',
    proposedBy: 'tester',
  });

  const approved = approveLawProposal(proposal.proposalId, {
    approvedBy: 'admin',
    rootDir,
  });
  assert.equal(approved.status, 'approved');
  assert.match(fs.readFileSync(path.join(rootDir, 'SYSTEM_LAWS.md'), 'utf8'), /LAW-006/);
  assert.ok(listActiveLaws().some((law) => law.id === 'LAW-006'));
});

test('rejects proposals without activating them', () => {
  const proposal = createLawProposal({
    lawId: 'LAW-006',
    title: 'Reject me',
    description: 'A rejected law.',
    rationale: 'No thanks.',
    glyph: 'EVT-LAW-PROPOSAL',
    proposedBy: 'tester',
  });
  const rejected = rejectLawProposal(proposal.proposalId, {
    rejectedBy: 'admin',
  });
  assert.equal(rejected.status, 'rejected');
});

test('reports compliance with current law hash and proposal counts', () => {
  const report = validateCompliance({
    eventType: 'dashboard.read',
    actorRole: 'dashboard',
    swarmRole: 'master',
    projectId: 'demo',
    auditLoggingEnabled: true,
    dashboardEnabled: true,
  });
  assert.equal(typeof report.lawHash, 'string');
  assert.equal(report.pendingProposalCount, 0);
});
