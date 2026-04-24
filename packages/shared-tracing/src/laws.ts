import { createHash } from 'node:crypto';

import { DROIDSPEAK_CATALOGS } from '@shared-droidspeak';

export interface DroidSwarmLawManifest {
  id: 'LAW-001';
  version: string;
  requirements: string[];
}

export interface LawEnforcementInput {
  swarmRole: 'master' | 'slave';
  dashboardEnabled?: boolean;
  auditLoggingEnabled?: boolean;
  projectId?: string;
}

export interface LawEnforcementResult {
  ok: boolean;
  rulesHash: string;
  violations: string[];
  manifest: DroidSwarmLawManifest;
}

const stableSerialize = (input: unknown): string => {
  if (input == null || typeof input !== 'object') {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((value) => stableSerialize(value)).join(',')}]`;
  }

  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};

export const LAW_001_MANIFEST: DroidSwarmLawManifest = {
  id: 'LAW-001',
  version: '2026-04-24',
  requirements: [
    'Compact Droidspeak vocabulary is the canonical internal federation envelope.',
    'Tamper-evident audit logging is required for federation activity.',
    'Every federation event must preserve project-scoped isolation metadata.',
    'Slave swarms must not host the dashboard or a master orchestrator role.',
    'Federation membership changes must be durable and reviewable.',
  ],
};

export const computeFederationRulesHash = (): string =>
  createHash('sha256')
    .update(stableSerialize({
      manifest: LAW_001_MANIFEST,
      catalogs: DROIDSPEAK_CATALOGS,
    }))
    .digest('hex');

export const enforceLaws = (input: LawEnforcementInput): LawEnforcementResult => {
  const violations: string[] = [];

  if (input.auditLoggingEnabled === false) {
    violations.push('Audit logging must remain enabled for federated nodes.');
  }

  if (!input.projectId) {
    violations.push('Federated nodes must declare a project id.');
  }

  if (input.swarmRole === 'slave' && input.dashboardEnabled === true) {
    violations.push('Slave swarms may not host the dashboard.');
  }

  return {
    ok: violations.length === 0,
    rulesHash: computeFederationRulesHash(),
    violations,
    manifest: LAW_001_MANIFEST,
  };
};
