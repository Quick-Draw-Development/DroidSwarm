import { buildEmbedding } from '../../../apps/orchestrator/src/utils/embeddings';

import { createLongTermMemory, listLongTermMemories, type LongTermMemoryEntry } from './memory-store';

export interface ReflectionNudge {
  title: string;
  description: string;
  targetSkill?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ReflectionCycleResult {
  analyzedCount: number;
  nudges: ReflectionNudge[];
  stored: LongTermMemoryEntry[];
}

const inferTargetSkill = (summary: string): string | undefined => {
  const normalized = summary.toLowerCase();
  if (normalized.includes('review')) {
    return 'code-review-agent';
  }
  if (normalized.includes('memory')) {
    return 'memory-assistant';
  }
  if (normalized.includes('test') || normalized.includes('verification')) {
    return 'verifier';
  }
  return undefined;
};

export const runReflectionCycle = (input?: {
  projectId?: string;
  recentLimit?: number;
}): ReflectionCycleResult => {
  const recent = listLongTermMemories({
    projectId: input?.projectId,
    memoryType: 'procedural',
    limit: input?.recentLimit ?? 24,
  });
  const failures = recent.filter((entry) => entry.metadata.outcome === 'failure');
  const nudges = failures.slice(0, 5).map((entry, index) => ({
    title: `Reflection nudge ${index + 1}`,
    description: `We keep struggling with ${entry.englishTranslation}. Consider refining or creating a skill to cover this trajectory.`,
    targetSkill: inferTargetSkill(entry.englishTranslation),
    severity: failures.length >= 3 ? 'high' : 'medium' as 'high' | 'medium',
  }));
  const stored = nudges.map((nudge) => createLongTermMemory({
    projectId: input?.projectId,
    memoryType: 'pattern',
    droidspeakSummary: `memory:pinned ${nudge.title}`,
    englishTranslation: nudge.description,
    relevanceScore: 0.75,
    embedding: buildEmbedding(nudge.description, 16),
    metadata: {
      kind: 'reflection-nudge',
      targetSkill: nudge.targetSkill,
      severity: nudge.severity,
    },
  }));
  return {
    analyzedCount: recent.length,
    nudges,
    stored,
  };
};
