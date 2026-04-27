import { buildEmbedding, cosineSimilarity } from '../../../apps/orchestrator/src/utils/embeddings';

import { listLongTermMemories, type LongTermMemoryEntry, type LongTermMemoryScope } from './memory-store';

export const retrieveRelevantMemories = (input: {
  query: string;
  projectId?: string;
  scope?: LongTermMemoryScope;
  limit?: number;
}): Array<LongTermMemoryEntry & { similarity: number }> => {
  const queryEmbedding = buildEmbedding(input.query, 16);
  return listLongTermMemories({
    projectId: input.projectId,
    scope: input.scope,
    limit: 200,
  })
    .map((entry) => ({
      ...entry,
      similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .filter((entry) => entry.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity || right.relevanceScore - left.relevanceScore)
    .slice(0, Math.max(1, input.limit ?? 5));
};

export const searchLongTermMemories = (input: {
  query: string;
  projectId?: string;
  limit?: number;
}): LongTermMemoryEntry[] =>
  retrieveRelevantMemories(input).map(({ similarity: _similarity, ...entry }) => entry);
