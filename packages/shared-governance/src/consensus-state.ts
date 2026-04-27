import { createHash } from 'node:crypto';

import { z } from 'zod';

import { type GovernanceConsensusRole } from './roles';

export const consensusProposalTypeSchema = z.enum([
  'law-change',
  'skill-activation',
  'skill-registration',
  'agent-registration',
  'agent-spawn',
  'task-handoff',
  'code-review',
  'human-override',
]);

export type ConsensusProposalType = z.infer<typeof consensusProposalTypeSchema>;

export const governanceVerdictSchema = z.object({
  role: z.enum(['proposer', 'reviewer', 'verifier', 'guardian', 'arbitrator']),
  agentId: z.string().min(1),
  verdict: z.enum(['approve', 'reject', 'veto']),
  reason: z.string().min(1),
  glyph: z.string().min(1),
  signedAt: z.string().datetime(),
});

export const consensusRoundStateSchema = z.object({
  consensusId: z.string().min(1),
  proposalId: z.string().min(1),
  proposalType: consensusProposalTypeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  roundCount: z.number().int().positive(),
  requiredRoles: z.array(z.enum(['proposer', 'reviewer', 'verifier', 'guardian', 'arbitrator'])),
  quorumThreshold: z.number().int().positive(),
  approved: z.boolean(),
  guardianVeto: z.boolean(),
  reason: z.string().min(1),
  backend: z.string().min(1),
  auditHash: z.string().min(1),
  systemStateHash: z.string().min(1).optional(),
  verdicts: z.array(governanceVerdictSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type GovernanceVerdictRecord = z.infer<typeof governanceVerdictSchema>;
export type ConsensusRoundState = z.infer<typeof consensusRoundStateSchema>;

export const computeConsensusOutcomeHash = (state: Pick<
  ConsensusRoundState,
  'proposalId' | 'proposalType' | 'approved' | 'guardianVeto' | 'reason' | 'verdicts'
>): string =>
  createHash('sha256').update(JSON.stringify(state)).digest('hex');

export const isGuardianRole = (role: GovernanceConsensusRole): boolean => role === 'guardian';
