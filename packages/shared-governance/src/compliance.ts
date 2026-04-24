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
): ComplianceReport => {
  const evaluatedAt = new Date().toISOString();
  const laws = listActiveLaws().map((law) => enforceLaw(law.id, context));
  const report: ComplianceReport = {
    ok: laws.every((entry) => entry.ok),
    lawHash: computeLawManifestHash(listActiveLaws()),
    evaluatedAt,
    laws,
    pendingProposalCount: listLawProposals().filter((entry) => entry.status === 'pending').length,
  };
  return report;
};
