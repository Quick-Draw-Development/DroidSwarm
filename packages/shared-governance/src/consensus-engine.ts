import { randomUUID } from 'node:crypto';

import { chooseBackendDecision } from '@model-router';
import { appendAuditEvent } from '@shared-tracing';

import { computeSystemStateHash, validateCompliance } from './compliance';
import { recordConsensusRound } from './proposal-store';
import {
  computeConsensusOutcomeHash,
  type ConsensusProposalType,
  type ConsensusRoundState,
  type GovernanceVerdictRecord,
} from './consensus-state';
import { GOVERNANCE_ROLES, resolveConsensusAgentsForRole } from './roles';
import type { GovernanceLawContext } from './laws-manifest';

const buildVerdict = (
  role: GovernanceVerdictRecord['role'],
  agentId: string,
  verdict: GovernanceVerdictRecord['verdict'],
  reason: string,
  glyph: string,
): GovernanceVerdictRecord => ({
  role,
  agentId,
  verdict,
  reason,
  glyph,
  signedAt: new Date().toISOString(),
});

export const runConsensusRound = (input: {
  proposalId?: string;
  proposalType: ConsensusProposalType;
  title: string;
  summary: string;
  glyph: string;
  context: GovernanceLawContext;
  humanOverride?: boolean;
}): ConsensusRoundState => {
  const backend = chooseBackendDecision({
    taskType: 'governance-consensus',
    stage: 'debate',
    summary: `${input.title} ${input.summary}`,
    platform: process.platform,
    arch: process.arch,
    preferAppleIntelligence: true,
    appleRuntimeAvailable: process.env.DROIDSWARM_APPLE_INTELLIGENCE_ENABLED !== '0',
    mlxAvailable: process.env.DROIDSWARM_MLX_ENABLED === '1',
  }).backend;
  const consensusId = randomUUID();
  const proposalId = input.proposalId ?? randomUUID();
  const compliance = validateCompliance({
    ...input.context,
    eventType: 'governance.vote',
    quorumRoles: input.context.recurrentEngine === 'openmythos'
      ? ['planner', 'reviewer', 'verifier', 'guardian']
      : ['planner', 'reviewer', 'verifier'],
    droidspeakState: {
      compact: input.glyph,
      expanded: input.summary,
      kind: 'memory_pinned',
    },
  });

  const guardianVerdict: GovernanceVerdictRecord['verdict'] = input.humanOverride === true
    ? 'approve'
    : compliance.ok
      ? 'approve'
      : 'veto';

  const verdicts: GovernanceVerdictRecord[] = [
    buildVerdict('proposer', resolveConsensusAgentsForRole('proposer')[0] ?? 'planner', 'approve', `Proposer advances ${input.proposalType}.`, 'EVT-CONSENSUS-ROUND'),
    buildVerdict('reviewer', resolveConsensusAgentsForRole('reviewer')[0] ?? 'reviewer', compliance.ok ? 'approve' : 'reject', compliance.ok ? 'Reviewer accepts the scoped change.' : 'Reviewer flags unresolved compliance risk.', 'EVT-CONSENSUS-ROUND'),
    buildVerdict('verifier', resolveConsensusAgentsForRole('verifier')[0] ?? 'verifier', compliance.ok ? 'approve' : 'reject', compliance.ok ? 'Verifier confirms current law compliance.' : compliance.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '), 'EVT-CONSENSUS-ROUND'),
    buildVerdict('guardian', resolveConsensusAgentsForRole('guardian')[0] ?? 'guardian', guardianVerdict, guardianVerdict === 'veto' ? 'Guardian veto due to compliance or safety violation.' : 'Guardian allows the action to proceed.', guardianVerdict === 'veto' ? 'EVT-GUARDIAN-VETO' : 'EVT-CONSENSUS-ROUND'),
    buildVerdict('arbitrator', resolveConsensusAgentsForRole('arbitrator')[0] ?? 'arbiter', guardianVerdict === 'veto' ? 'reject' : 'approve', guardianVerdict === 'veto' ? 'Arbitrator records the guardian veto.' : 'Arbitrator confirms quorum and finalizes approval.', 'EVT-CONSENSUS-ROUND'),
  ];

  const approvedCount = verdicts.filter((entry) => entry.verdict === 'approve').length;
  const guardianVeto = verdicts.some((entry) => entry.role === 'guardian' && entry.verdict === 'veto');
  const approved = approvedCount >= 3 && !guardianVeto;
  const outcomeHash = computeConsensusOutcomeHash({
    proposalId,
    proposalType: input.proposalType,
    approved,
    guardianVeto,
    reason: guardianVeto ? 'guardian-veto' : approved ? 'approved' : 'rejected',
    verdicts,
  });
  const audit = appendAuditEvent('GOVERNANCE_CONSENSUS_ROUND', {
    consensusId,
    proposalId,
    proposalType: input.proposalType,
    approved,
    guardianVeto,
    verdicts,
    backend,
    systemStateHash: computeSystemStateHash(),
  });
  const round: ConsensusRoundState = {
    consensusId,
    proposalId,
    proposalType: input.proposalType,
    title: input.title,
    summary: input.summary,
    roundCount: 3,
    requiredRoles: [...GOVERNANCE_ROLES],
    quorumThreshold: 3,
    approved,
    guardianVeto,
    reason: guardianVeto ? 'Guardian veto triggered.' : approved ? 'Consensus approved.' : 'Consensus rejected.',
    backend,
    auditHash: audit.hash || outcomeHash,
    systemStateHash: computeSystemStateHash(),
    verdicts,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  recordConsensusRound(round);
  return round;
};
