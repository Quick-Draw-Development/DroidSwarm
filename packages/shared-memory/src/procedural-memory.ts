import { buildEmbedding } from '../../../apps/orchestrator/src/utils/embeddings';

import { createLongTermMemory, type LongTermMemoryEntry } from './memory-store';

export const recordProceduralMemory = (input: {
  projectId?: string;
  sessionId?: string;
  sourceEventHash?: string;
  sourceTaskId?: string;
  sourceRunId?: string;
  outcome: 'success' | 'failure';
  droidspeakSummary: string;
  englishTranslation: string;
  trajectory: Record<string, unknown>;
}): LongTermMemoryEntry =>
  createLongTermMemory({
    projectId: input.projectId,
    sessionId: input.sessionId,
    memoryType: 'procedural',
    droidspeakSummary: input.droidspeakSummary,
    englishTranslation: input.englishTranslation,
    sourceEventHash: input.sourceEventHash,
    sourceTaskId: input.sourceTaskId,
    sourceRunId: input.sourceRunId,
    relevanceScore: input.outcome === 'success' ? 0.8 : 0.7,
    embedding: buildEmbedding(`${input.englishTranslation} ${JSON.stringify(input.trajectory)}`, 16),
    metadata: {
      outcome: input.outcome,
      trajectory: input.trajectory,
    },
  });
