import { createHash } from 'node:crypto';

import { z } from 'zod';

export const builtInLawIdSchema = z.enum([
  'LAW-001',
  'LAW-002',
  'LAW-003',
  'LAW-004',
  'LAW-005',
  'LAW-099',
]);

export type BuiltInLawId = z.infer<typeof builtInLawIdSchema>;
export type LawId = BuiltInLawId | `LAW-${string}`;

export interface GovernanceLawContext {
  eventType?: string;
  actorRole?: string;
  swarmRole?: 'master' | 'slave';
  projectId?: string;
  auditLoggingEnabled?: boolean;
  dashboardEnabled?: boolean;
  humanApproval?: boolean;
  droidspeakState?: unknown;
  quorumRoles?: string[];
  guardianVote?: 'approve' | 'reject' | 'veto';
  recurrentEngine?: string;
  spectralRadius?: number;
  requestedLoops?: number;
  driftScore?: number;
}

export interface LawDefinition {
  id: LawId;
  version: string;
  title: string;
  description: string;
  glyph: string;
  enforcement(context: GovernanceLawContext): string[];
}

const requiresStructuredDroidspeak = (eventType: string | undefined): boolean =>
  typeof eventType === 'string'
  && [
    'governance.proposal',
    'governance.debate',
    'governance.vote',
    'governance.approval',
    'federation.message',
  ].includes(eventType);

export const BUILT_IN_LAWS: LawDefinition[] = [
  {
    id: 'LAW-001',
    version: '2026-04-24',
    title: 'Droidspeak Required For Critical Internal Governance',
    description: 'Governance and federation-critical events must preserve compact Droidspeak-compatible state.',
    glyph: 'EVT-LAW-PROPOSAL',
    enforcement(context) {
      if (requiresStructuredDroidspeak(context.eventType) && !context.droidspeakState) {
        return ['Governance and federation-critical events require compact Droidspeak state.'];
      }
      return [];
    },
  },
  {
    id: 'LAW-002',
    version: '2026-04-24',
    title: 'Tamper-Evident Audit Required',
    description: 'Governance actions must always be auditable.',
    glyph: 'EVT-COMPLIANCE-CHECK',
    enforcement(context) {
      return context.auditLoggingEnabled === false
        ? ['Governance actions require tamper-evident audit logging.']
        : [];
    },
  },
  {
    id: 'LAW-003',
    version: '2026-04-24',
    title: 'Human Approval Required',
    description: 'Adaptive law changes must not activate without explicit admin approval.',
    glyph: 'EVT-HUMAN-APPROVAL',
    enforcement(context) {
      return context.eventType === 'governance.activate-law' && context.humanApproval !== true
        ? ['Adaptive law activation requires explicit human approval.']
        : [];
    },
  },
  {
    id: 'LAW-004',
    version: '2026-04-24',
    title: 'Debate Quorum And Guardian Protection',
    description: 'System-changing debates require planner, reviewer, and verifier participation with guardian veto support.',
    glyph: 'EVT-VOTE',
    enforcement(context) {
      if (context.eventType !== 'governance.vote') {
        return [];
      }
      const quorumRoles = new Set(context.quorumRoles ?? []);
      const missing = ['planner', 'reviewer', 'verifier'].filter((role) => !quorumRoles.has(role));
      if (context.guardianVote === 'veto') {
        return ['Guardian veto prevents governance activation.'];
      }
      return missing.length > 0
        ? [`Governance quorum missing required roles: ${missing.join(', ')}.`]
        : [];
    },
  },
  {
    id: 'LAW-005',
    version: '2026-04-24',
    title: 'Slave Governance Restrictions',
    description: 'Slave swarms cannot host dashboard governance control or claim master authority.',
    glyph: 'EVT-LAW-UPDATE',
    enforcement(context) {
      const violations: string[] = [];
      if (context.swarmRole === 'slave' && context.dashboardEnabled === true) {
        violations.push('Slave swarms may not host the dashboard.');
      }
      if (context.swarmRole === 'slave' && context.actorRole === 'master') {
        violations.push('Slave swarms may not claim master governance authority.');
      }
      return violations;
    },
  },
  {
    id: 'LAW-099',
    version: '2026-04-29',
    title: 'Spectral Stability Of Recurrent Engines',
    description: 'Recurrent engines must remain spectrally stable before high-complexity execution continues.',
    glyph: 'MYTHOS_STATUS',
    enforcement(context) {
      if (context.recurrentEngine !== 'openmythos') {
        return [];
      }
      const radius = context.spectralRadius;
      if (typeof radius !== 'number') {
        return ['OpenMythos tasks require a spectral radius measurement.'];
      }
      if (radius >= 1.0) {
        return ['OpenMythos spectral radius is unstable (>= 1.0); halt and rollback required.'];
      }
      return [];
    },
  },
];

const stableSerialize = (input: unknown): string => {
  if (input == null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};

export const getBuiltInLaw = (lawId: LawId): LawDefinition | undefined =>
  BUILT_IN_LAWS.find((law) => law.id === lawId);

export const listBuiltInLaws = (): LawDefinition[] => [...BUILT_IN_LAWS];

export const computeLawManifestHash = (laws: LawDefinition[] = BUILT_IN_LAWS): string =>
  createHash('sha256').update(stableSerialize(laws)).digest('hex');
