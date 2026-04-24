import { randomUUID } from 'node:crypto';

import { chooseBackendDecision } from '@model-router';
import { appendAuditEvent } from '@shared-tracing';

import { validateCompliance } from './compliance';
import { createLawProposal, recordGovernanceDebateTimestamp, type LawProposalRecord } from './proposal-store';
import type { GovernanceLawContext, LawId } from './laws-manifest';

export interface DebateParticipant {
  role: 'planner' | 'reviewer' | 'verifier' | 'guardian';
  stance: 'for' | 'against' | 'neutral';
  argument: string;
}

export interface DebateRoundRecord {
  round: 1 | 2 | 3;
  stage: 'proposal' | 'arguments' | 'rebuttals' | 'vote';
  participants: DebateParticipant[];
  glyph: string;
  english: string;
}

export interface DebateResult {
  debateId: string;
  proposalId: string;
  backend: string;
  status: 'rejected' | 'pending-human-approval';
  rounds: DebateRoundRecord[];
  quorumRoles: string[];
  guardianVote: 'approve' | 'reject' | 'veto';
  proposal: LawProposalRecord;
}

const buildArguments = (title: string, rationale: string): DebateParticipant[] => [
  {
    role: 'planner',
    stance: 'for',
    argument: `Planner: ${title} creates explicit system intent. ${rationale}`,
  },
  {
    role: 'reviewer',
    stance: 'against',
    argument: `Reviewer: ${title} must stay minimal and avoid silent behavior drift.`,
  },
  {
    role: 'verifier',
    stance: 'neutral',
    argument: 'Verifier: activation is acceptable only if existing law compliance remains intact and testable.',
  },
];

const buildRebuttals = (title: string): DebateParticipant[] => [
  {
    role: 'planner',
    stance: 'for',
    argument: `Planner rebuttal: ${title} is scoped and still requires human approval.`,
  },
  {
    role: 'reviewer',
    stance: 'against',
    argument: 'Reviewer rebuttal: scope must remain auditable and reversible.',
  },
  {
    role: 'verifier',
    stance: 'for',
    argument: 'Verifier rebuttal: structured approval plus audit logging preserves safety.',
  },
];

export const runGovernanceDebate = (input: {
  lawId: LawId;
  title: string;
  description: string;
  rationale: string;
  glyph: string;
  proposedBy: string;
  context: GovernanceLawContext;
}): DebateResult => {
  const debateId = randomUUID();
  const backend = chooseBackendDecision({
    taskType: 'governance-debate',
    stage: 'debate',
    summary: `${input.title} ${input.rationale}`,
    platform: process.platform,
    arch: process.arch,
    appleRuntimeAvailable: process.env.DROIDSWARM_APPLE_INTELLIGENCE_ENABLED !== '0',
    mlxAvailable: process.env.DROIDSWARM_MLX_ENABLED === '1',
  }).backend;

  const proposal = createLawProposal({
    lawId: input.lawId,
    title: input.title,
    description: input.description,
    rationale: input.rationale,
    glyph: input.glyph,
    proposedBy: input.proposedBy,
    debateId,
  });

  const roundOneParticipants = buildArguments(input.title, input.rationale);
  const roundTwoParticipants = buildRebuttals(input.title);
  const guardianVote: DebateResult['guardianVote'] = input.context.guardianVote ?? 'approve';
  const quorumRoles = ['planner', 'reviewer', 'verifier'];
  const voteParticipants: DebateParticipant[] = [
    { role: 'planner', stance: 'for', argument: 'Planner votes to continue.' },
    { role: 'reviewer', stance: guardianVote === 'veto' ? 'against' : 'for', argument: guardianVote === 'veto' ? 'Guardian veto triggered due to law risk.' : 'Reviewer accepts with human approval.' },
    { role: 'verifier', stance: 'for', argument: 'Verifier confirms the proposal can remain pending human approval.' },
    { role: 'guardian', stance: guardianVote === 'veto' ? 'against' : 'for', argument: guardianVote === 'veto' ? 'Guardian veto.' : 'Guardian allows human review.' },
  ];

  const compliance = validateCompliance({
    ...input.context,
    eventType: 'governance.vote',
    quorumRoles,
    guardianVote,
    humanApproval: false,
    droidspeakState: { compact: input.glyph, kind: 'memory_pinned', expanded: input.description },
  });

  const rounds: DebateRoundRecord[] = [
    {
      round: 1,
      stage: 'arguments',
      participants: roundOneParticipants,
      glyph: 'EVT-DEBATE-ROUND',
      english: `Round 1 debate for ${input.lawId}.`,
    },
    {
      round: 2,
      stage: 'rebuttals',
      participants: roundTwoParticipants,
      glyph: 'EVT-DEBATE-ROUND',
      english: `Round 2 rebuttals for ${input.lawId}.`,
    },
    {
      round: 3,
      stage: 'vote',
      participants: voteParticipants,
      glyph: 'EVT-VOTE',
      english: `Final vote for ${input.lawId}.`,
    },
  ];

  for (const round of rounds) {
    appendAuditEvent('GOVERNANCE_DEBATE_ROUND', {
      debateId,
      lawId: input.lawId,
      round: round.round,
      stage: round.stage,
      glyph: round.glyph,
      english: round.english,
      participants: round.participants,
    });
  }

  recordGovernanceDebateTimestamp(new Date().toISOString());
  const status = compliance.ok ? 'pending-human-approval' : 'rejected';
  appendAuditEvent('GOVERNANCE_DEBATE_RESULT', {
    debateId,
    proposalId: proposal.proposalId,
    lawId: input.lawId,
    backend,
    status,
    complianceOk: compliance.ok,
    violations: compliance.laws.filter((entry) => !entry.ok),
  });

  return {
    debateId,
    proposalId: proposal.proposalId,
    backend,
    status,
    rounds,
    quorumRoles,
    guardianVote,
    proposal,
  };
};
