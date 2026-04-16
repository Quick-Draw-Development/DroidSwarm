import type { CheckpointDelta, ProjectCheckpoint, ProjectDecision, ProjectFact, WorkerResult } from '@shared-types';

export const mergeCheckpointDelta = (result: WorkerResult): CheckpointDelta => ({
  factsAdded: [...new Set(result.checkpointDelta.factsAdded)],
  decisionsAdded: [...new Set(result.checkpointDelta.decisionsAdded)],
  openQuestions: [...new Set(result.checkpointDelta.openQuestions)],
  risksFound: [...new Set(result.checkpointDelta.risksFound)],
  nextBestActions: [...new Set(result.checkpointDelta.nextBestActions)],
  evidenceRefs: [...new Set(result.checkpointDelta.evidenceRefs)],
});

export const buildProjectFacts = (input: {
  projectId: string;
  repoId: string;
  delta: CheckpointDelta;
  createdAt: string;
}): ProjectFact[] => input.delta.factsAdded.map((statement, index) => ({
  id: `${input.projectId}-fact-${index}-${statement.slice(0, 24)}`,
  projectId: input.projectId,
  repoId: input.repoId,
  scope: 'task',
  statement,
  confidence: 0.7,
  evidenceRefs: input.delta.evidenceRefs,
  status: 'proposed',
  createdAt: input.createdAt,
}));

export const buildProjectDecisions = (input: {
  projectId: string;
  repoId: string;
  delta: CheckpointDelta;
  createdAt: string;
}): ProjectDecision[] => input.delta.decisionsAdded.map((summary, index) => ({
  id: `${input.projectId}-decision-${index}-${summary.slice(0, 24)}`,
  projectId: input.projectId,
  repoId: input.repoId,
  summary,
  why: 'Derived from worker checkpoint delta',
  alternativesRejected: [],
  evidenceRefs: input.delta.evidenceRefs,
  createdAt: input.createdAt,
}));

export const buildProjectCheckpoint = (input: {
  projectId: string;
  repoId: string;
  runId: string;
  summary: string;
  delta: CheckpointDelta;
  createdAt: string;
}): ProjectCheckpoint => ({
  id: `${input.runId}-${input.createdAt}`,
  projectId: input.projectId,
  repoId: input.repoId,
  runId: input.runId,
  summary: input.summary,
  facts: input.delta.factsAdded,
  decisions: input.delta.decisionsAdded,
  openQuestions: input.delta.openQuestions,
  componentSummaries: input.delta.nextBestActions,
  createdAt: input.createdAt,
});
