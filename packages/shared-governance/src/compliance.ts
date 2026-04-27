import { appendAuditEvent } from '@shared-tracing';
import { buildDynamicSkillVerbCatalog, listRegisteredSkillManifests, listSpecializedAgents } from '@shared-skills';
import { buildDroidspeakCatalogs } from '@shared-droidspeak';

import { computeLawManifestHash, getBuiltInLaw, listBuiltInLaws, type GovernanceLawContext, type LawDefinition, type LawId } from './laws-manifest';
import { listApprovedRuntimeLaws, listLawProposals } from './proposal-store';

export interface LawEnforcementResult {
  lawId: LawId;
  ok: boolean;
  violations: string[];
}

export interface ComplianceReport {
  ok: boolean;
  lawHash: string;
  evaluatedAt: string;
  laws: LawEnforcementResult[];
  pendingProposalCount: number;
}

const buildRuntimeLaw = (law: LawDefinition): LawDefinition => ({
  ...law,
  enforcement: law.enforcement ?? (() => []),
});

export const listActiveLaws = (): LawDefinition[] => [
  ...listBuiltInLaws(),
  ...listApprovedRuntimeLaws().map(buildRuntimeLaw),
];

export const enforceLaw = (lawId: LawId, context: GovernanceLawContext): LawEnforcementResult => {
  const law = listActiveLaws().find((entry) => entry.id === lawId) ?? getBuiltInLaw(lawId);
  if (!law) {
    return {
      lawId,
      ok: false,
      violations: [`Unknown law: ${lawId}`],
    };
  }
  const violations = law.enforcement(context);
  return {
    lawId,
    ok: violations.length === 0,
    violations,
  };
};

export const validateCompliance = (
  context: GovernanceLawContext,
  lawId?: LawId,
): ComplianceReport => {
  const evaluatedAt = new Date().toISOString();
  const laws = lawId
    ? [enforceLaw(lawId, context)]
    : listActiveLaws().map((law) => enforceLaw(law.id, context));
  const report: ComplianceReport = {
    ok: laws.every((entry) => entry.ok),
    lawHash: computeLawManifestHash(listActiveLaws()),
    evaluatedAt,
    laws,
    pendingProposalCount: listLawProposals().filter((entry) => entry.status === 'pending').length,
  };
  return report;
};

export const runComplianceCheck = (
  context: GovernanceLawContext,
  lawId?: LawId,
): ComplianceReport => {
  const report = validateCompliance(context, lawId);
  appendAuditEvent('GOVERNANCE_COMPLIANCE_CHECK', {
    projectId: context.projectId,
    actorRole: context.actorRole,
    eventType: context.eventType,
    ok: report.ok,
    lawHash: report.lawHash,
    violations: report.laws.filter((entry) => !entry.ok),
  });
  return report;
};

export const computeSystemStateHash = (): string =>
  computeLawManifestHash([
    ...listActiveLaws(),
    ...listRegisteredSkillManifests().map((entry) => ({
      id: entry.name as `LAW-${string}`,
      version: entry.version,
      title: entry.name,
      description: JSON.stringify(entry.manifest),
      glyph: entry.droidspeakVerbs[0]?.code ?? 'EVT-SKILL-REGISTERED',
      enforcement: () => [],
    })),
    ...listSpecializedAgents().map((entry) => ({
      id: entry.name as `LAW-${string}`,
      version: entry.version,
      title: entry.name,
      description: JSON.stringify(entry.manifest),
      glyph: 'EVT-AGENT-UPDATED',
      enforcement: () => [],
    })),
    {
      id: 'LAW-DROIDSCATALOG' as `LAW-${string}`,
      version: new Date().toISOString().slice(0, 10),
      title: 'Droidspeak catalog snapshot',
      description: JSON.stringify(buildDroidspeakCatalogs({ verbs: buildDynamicSkillVerbCatalog() })),
      glyph: 'EVT-DRIFT-DETECTED',
      enforcement: () => [],
    },
  ]);
