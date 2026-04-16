import { buildProjectCheckpoint, buildProjectDecisions, buildProjectFacts, mergeCheckpointDelta } from '@shared-memory';
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
  }
}
