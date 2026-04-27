import {
  buildProjectCheckpoint,
  buildProjectDecisions,
  buildProjectFacts,
  createLongTermMemory,
  mergeCheckpointDelta,
  recordProceduralMemory,
} from '@shared-memory';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type { WorkerResult } from '../types';

export class CheckpointMergeService {
  constructor(private readonly persistence: OrchestratorPersistenceService) {}

  merge(result: WorkerResult): void {
    const delta = mergeCheckpointDelta(result);
    const run = this.persistence.getRunRecord();
    if (!run.repoId) {
      return;
    }
    const createdAt = new Date().toISOString();
    for (const fact of buildProjectFacts({ projectId: run.projectId, repoId: run.repoId, delta, createdAt })) {
      this.persistence.recordProjectFact(fact);
    }
    for (const decision of buildProjectDecisions({ projectId: run.projectId, repoId: run.repoId, delta, createdAt })) {
      this.persistence.recordProjectDecision(decision);
    }
    this.persistence.recordProjectCheckpoint(buildProjectCheckpoint({
      projectId: run.projectId,
      repoId: run.repoId,
      runId: run.runId,
      summary: result.summary,
      delta,
      createdAt,
    }));
    createLongTermMemory({
      projectId: run.projectId,
      sessionId: run.runId,
      memoryType: 'semantic',
      droidspeakSummary: `memory:pinned ${result.summary}`,
      englishTranslation: result.summary,
      relevanceScore: result.success ? 0.8 : 0.6,
      metadata: {
        checkpointDelta: delta,
      },
    });
    recordProceduralMemory({
      projectId: run.projectId,
      sessionId: run.runId,
      sourceRunId: run.runId,
      outcome: result.success ? 'success' : 'failure',
      droidspeakSummary: result.success ? 'summary_emitted procedural' : 'blocked procedural',
      englishTranslation: result.summary,
      trajectory: {
        engine: result.engine,
        model: result.model,
        activity: result.activity,
      },
    });
  }
}
