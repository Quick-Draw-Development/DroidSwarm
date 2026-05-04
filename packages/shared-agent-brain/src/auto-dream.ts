import { runConsensusRound } from '@shared-governance';
import { appendAuditEvent } from '@shared-tracing';

import { appendBrainPromotionCandidate, listBrainMemoryEntries } from './memory-store';

export interface BrainDreamCycleResult {
  analyzedCount: number;
  candidateCount: number;
  candidates: Array<{
    candidateId: string;
    summary: string;
    clusterKey: string;
  }>;
  consensusId: string;
}

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);

const clusterKeyFor = (value: string): string => tokenize(value).slice(0, 3).join('-') || 'misc-cluster';

export const runBrainDreamCycle = (input?: {
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
  reviewedBy?: string;
}): BrainDreamCycleResult => {
  const consensus = runConsensusRound({
    proposalType: 'human-override',
    title: 'Nightly brain dream cycle',
    summary: `Mechanical clustering for ${input?.projectId ?? 'global'}`,
    glyph: 'memory.pinned',
    context: {
      eventType: 'governance.proposal',
      actorRole: 'ralph-wiggum-worker',
      swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
      projectId: input?.projectId,
      auditLoggingEnabled: true,
      dashboardEnabled: true,
      droidspeakState: {
        compact: 'memory.pinned',
        expanded: 'brain dream cycle',
        kind: 'memory_pinned',
      },
    },
    humanOverride: true,
  });
  const recent = listBrainMemoryEntries({
    projectRoot: input?.projectRoot,
    global: input?.global,
    projectId: input?.projectId,
    layer: 'episodic',
    limit: 64,
  });
  const grouped = new Map<string, typeof recent>();
  for (const entry of recent) {
    const key = clusterKeyFor(`${entry.title} ${entry.content}`);
    const existing = grouped.get(key) ?? [];
    existing.push(entry);
    grouped.set(key, existing);
  }
  const candidates = [...grouped.entries()]
    .filter(([, entries]) => entries.length >= 2)
    .slice(0, 8)
    .map(([clusterKey, entries]) => appendBrainPromotionCandidate({
      projectRoot: input?.projectRoot,
      global: input?.global,
      projectId: input?.projectId,
      clusterKey,
      summary: `Pattern cluster ${clusterKey}: ${entries[0]?.content.slice(0, 120) ?? 'No summary'}`,
      sourceEntryIds: entries.map((entry) => entry.id),
    }));
  appendAuditEvent('AGENT_BRAIN_DREAM_RUN', {
    projectId: input?.projectId,
    analyzedCount: recent.length,
    candidateCount: candidates.length,
    consensusId: consensus.consensusId,
  });
  return {
    analyzedCount: recent.length,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      summary: candidate.summary,
      clusterKey: candidate.clusterKey,
    })),
    consensusId: consensus.consensusId,
  };
};
