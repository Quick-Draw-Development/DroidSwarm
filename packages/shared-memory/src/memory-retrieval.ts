import { buildEmbedding, cosineSimilarity } from '../../../apps/orchestrator/src/utils/embeddings';
import { searchBrainMemories } from '@shared-agent-brain';

import { listLongTermMemories, type LongTermMemoryEntry, type LongTermMemoryScope } from './memory-store';

export const retrieveRelevantMemories = (input: {
  query: string;
  projectId?: string;
  scope?: LongTermMemoryScope;
  limit?: number;
}): Array<LongTermMemoryEntry & { similarity: number }> => {
  const queryEmbedding = buildEmbedding(input.query, 16);
  const dbResults = listLongTermMemories({
    projectId: input.projectId,
    scope: input.scope,
    limit: 200,
  })
    .map((entry) => ({
      ...entry,
      similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .filter((entry) => entry.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity || right.relevanceScore - left.relevanceScore);
  const brainResults = ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_ENABLE_AGENTIC_BRAIN ?? '').toLowerCase())
    ? searchBrainMemories({
      query: input.query,
      projectId: input.projectId,
      limit: Math.max(1, input.limit ?? 5),
    }).map((entry, index) => ({
      memoryId: entry.entryId ?? `brain-${index}-${entry.title}`,
      projectId: input.projectId,
      sessionId: undefined,
      scope: 'project' as const,
      timestamp: new Date().toISOString(),
      memoryType: entry.layer === 'personal'
        ? 'user-preference' as const
        : entry.layer === 'episodic'
          ? 'procedural' as const
          : 'semantic' as const,
      droidspeakSummary: entry.title,
      englishTranslation: entry.content,
      sourceEventHash: undefined,
      sourceTaskId: undefined,
      sourceRunId: undefined,
      relevanceScore: entry.score,
      embedding: queryEmbedding,
      metadata: {
        source: 'agent-brain',
        layer: entry.layer,
        path: entry.path,
      },
      expiresAt: undefined,
      similarity: entry.score,
    }))
    : [];
  return [...dbResults, ...brainResults]
    .sort((left, right) => right.similarity - left.similarity || right.relevanceScore - left.relevanceScore)
    .slice(0, Math.max(1, input.limit ?? 5));
};

export const searchLongTermMemories = (input: {
  query: string;
  projectId?: string;
  limit?: number;
}): LongTermMemoryEntry[] =>
  retrieveRelevantMemories(input).map(({ similarity: _similarity, ...entry }) => entry);
