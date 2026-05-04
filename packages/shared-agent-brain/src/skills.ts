import fs from 'node:fs';
import path from 'node:path';

import { appendAuditEvent } from '@shared-tracing';

export interface SkillDisclosureManifest {
  name: string;
  description: string;
  capabilities: string[];
  requiredBackends: string[];
  triggerHints: string[];
  selfRewriteHooks: Array<{
    pattern: string;
    threshold: number;
    windowDays: number;
  }>;
}

const normalizeText = (value: string): string =>
  value.toLowerCase().trim();

const parseJsonLines = <T>(target: string): T[] => {
  if (!fs.existsSync(target)) {
    return [];
  }
  return fs.readFileSync(target, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
};

export const resolveSkillManifestIndexFile = (skillsRoot: string): string =>
  path.resolve(skillsRoot, '_manifest.jsonl');

export const resolveSkillIndexMarkdownFile = (skillsRoot: string): string =>
  path.resolve(skillsRoot, '_index.md');

export const buildSkillDisclosureIndex = (input: {
  skillsRoot: string;
  manifests: Array<{
    name: string;
    description: string;
    capabilities: string[];
    requiredBackends: string[];
    modelPreferences?: { tags?: string[] };
    selfRewriteHooks?: Array<{ pattern: string; threshold: number; windowDays: number }>;
  }>;
}): void => {
  const records: SkillDisclosureManifest[] = input.manifests.map((manifest) => ({
    name: manifest.name,
    description: manifest.description,
    capabilities: manifest.capabilities,
    requiredBackends: manifest.requiredBackends,
    triggerHints: [
      manifest.name,
      ...manifest.capabilities,
      ...(manifest.modelPreferences?.tags ?? []),
    ].map(normalizeText),
    selfRewriteHooks: manifest.selfRewriteHooks ?? [],
  }));
  fs.writeFileSync(resolveSkillManifestIndexFile(input.skillsRoot), records.map((record) => JSON.stringify(record)).join('\n') + (records.length > 0 ? '\n' : ''));
  fs.writeFileSync(resolveSkillIndexMarkdownFile(input.skillsRoot), [
    '# Skill Index',
    '',
    ...records.map((record) => `- **${record.name}**: ${record.description}`),
  ].join('\n') + '\n');
  appendAuditEvent('SKILL_DISCOVER', {
    count: records.length,
    skillsRoot: input.skillsRoot,
  });
};

export const readSkillDisclosureIndex = (skillsRoot: string): SkillDisclosureManifest[] =>
  parseJsonLines<SkillDisclosureManifest>(resolveSkillManifestIndexFile(skillsRoot));

export const findSkillsForTrigger = (skillsRoot: string, triggerText: string): SkillDisclosureManifest[] => {
  const normalized = normalizeText(triggerText);
  return readSkillDisclosureIndex(skillsRoot)
    .filter((entry) => entry.triggerHints.some((hint) => normalized.includes(hint)));
};

export const recordSkillUsageOutcome = (input: {
  skillsRoot: string;
  projectId?: string;
  skillName: string;
  outcome: 'success' | 'failure';
  detail: string;
  metadata?: Record<string, unknown>;
}): void => {
  const target = path.resolve(input.skillsRoot, '_usage-patterns.jsonl');
  fs.appendFileSync(target, `${JSON.stringify({
    skillName: input.skillName,
    projectId: input.projectId,
    outcome: input.outcome,
    detail: input.detail,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  })}\n`);
};

export const listSkillRewriteCandidates = (input: {
  skillsRoot: string;
  withinDays?: number;
}): Array<{
  skillName: string;
  failureCount: number;
  latestDetail: string;
}> => {
  const usageFile = path.resolve(input.skillsRoot, '_usage-patterns.jsonl');
  const cutoff = Date.now() - (input.withinDays ?? 14) * 24 * 60 * 60 * 1000;
  const usage = parseJsonLines<{
    skillName: string;
    outcome: 'success' | 'failure';
    detail: string;
    createdAt: string;
  }>(usageFile)
    .filter((entry) => entry.outcome === 'failure')
    .filter((entry) => Date.parse(entry.createdAt) >= cutoff);
  const manifestIndex = readSkillDisclosureIndex(input.skillsRoot);
  return manifestIndex.flatMap((manifest) => {
    const failures = usage.filter((entry) =>
      entry.skillName === manifest.name
      || manifest.triggerHints.some((hint) => entry.detail.toLowerCase().includes(hint)));
    const strongestHook = manifest.selfRewriteHooks.find((hook) =>
      failures.filter((entry) => entry.detail.toLowerCase().includes(hook.pattern.toLowerCase()) || hook.pattern === '*').length >= hook.threshold);
    if (!strongestHook && failures.length < 3) {
      return [];
    }
    return [{
      skillName: manifest.name,
      failureCount: failures.length,
      latestDetail: failures[0]?.detail ?? 'Repeated failures detected.',
    }];
  });
};
