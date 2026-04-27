import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  approveLawProposal,
  computeSystemStateHash,
  createLawProposal,
  createDriftSnapshot,
  enforceLaw,
  listConsensusRounds,
  listDriftSnapshots,
  listGovernanceRoles,
  listActiveLaws,
  listLawProposals,
  overrideLawProposal,
  rejectLawProposal,
  runConsensusRound,
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
  assert.equal(typeof result.consensusId, 'string');
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

test('lists governance roles and records approved consensus rounds', () => {
  const roles = listGovernanceRoles();
  assert.equal(roles.length, 5);

  const round = runConsensusRound({
    proposalId: 'proposal-1',
    proposalType: 'agent-spawn',
    title: 'Spawn reviewer',
    summary: 'Allow a reviewer helper to start.',
    glyph: 'EVT-CONSENSUS-ROUND',
    context: {
      eventType: 'governance.vote',
      actorRole: 'planner',
      swarmRole: 'master',
      projectId: 'demo',
      auditLoggingEnabled: true,
      dashboardEnabled: false,
      droidspeakState: { compact: 'EVT-CONSENSUS-ROUND', expanded: 'spawn reviewer', kind: 'memory_pinned' },
    },
  });

  assert.equal(round.approved, true);
  assert.ok(listConsensusRounds().some((entry) => entry.consensusId === round.consensusId));
});

test('guardian veto blocks failing consensus rounds', () => {
  const round = runConsensusRound({
    proposalId: 'proposal-2',
    proposalType: 'task-handoff',
    title: 'Block invalid handoff',
    summary: 'Handoff without droidspeak context.',
    glyph: 'EVT-CONSENSUS-ROUND',
    context: {
      eventType: 'governance.vote',
      actorRole: 'planner',
      swarmRole: 'master',
      projectId: 'demo',
      auditLoggingEnabled: true,
      dashboardEnabled: false,
      guardianVote: 'veto',
    },
  });

  assert.equal(round.approved, false);
  assert.equal(round.guardianVeto, true);
});

test('records drift snapshots for matching and mismatched system state hashes', () => {
  const matched = createDriftSnapshot({
    nodeId: 'node-a',
    projectId: 'demo',
    remoteHash: computeSystemStateHash(),
    source: 'test',
  });
  assert.equal(matched.matches, true);

  const mismatched = createDriftSnapshot({
    nodeId: 'node-b',
    projectId: 'demo',
    remoteHash: 'mismatch',
    source: 'test',
  });
  assert.equal(mismatched.matches, false);
  assert.ok(listDriftSnapshots().length >= 2);
});

test('allows explicit human overrides for pending proposals', () => {
  const proposal = createLawProposal({
    lawId: 'LAW-006',
    title: 'Override me',
    description: 'An overridable law.',
    rationale: 'Manual recovery path.',
    glyph: 'EVT-LAW-PROPOSAL',
    proposedBy: 'tester',
  });
  const approved = overrideLawProposal(proposal.proposalId, {
    overriddenBy: 'admin',
  });
  assert.equal(approved.status, 'approved');
});
