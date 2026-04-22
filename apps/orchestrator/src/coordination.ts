import { randomUUID } from 'node:crypto';

import type { ArtifactRecord, HandoffPacket, PersistedTask, TaskStateDigest } from './types';

type DroidspeakKind = NonNullable<TaskStateDigest['droidspeak']>['kind'];

const compactKinds: Record<DroidspeakKind, string> = {
  plan_status: 'plan:active',
  blocked: 'state:blocked',
  unblocked: 'state:unblocked',
  handoff_ready: 'handoff:ready',
  verification_needed: 'verify:needed',
  summary_emitted: 'summary:emitted',
  memory_pinned: 'memory:pinned',
};

export const buildDroidspeakV2 = (
  kind: DroidspeakKind,
  expanded: string,
  compact = compactKinds[kind],
): TaskStateDigest['droidspeak'] => ({
  kind,
  compact,
  expanded,
});

export const droidspeakForStatusCode = (
  statusCode: string,
  expanded: string,
): TaskStateDigest['droidspeak'] | undefined => {
  switch (statusCode) {
    case 'agent_started':
      return buildDroidspeakV2('plan_status', expanded);
    case 'agent_completed':
      return buildDroidspeakV2('summary_emitted', expanded);
    case 'agent_blocked':
    case 'agent_failed':
      return buildDroidspeakV2('blocked', expanded);
    case 'task_cancellation_acknowledged':
      return buildDroidspeakV2('unblocked', expanded);
    default:
      return undefined;
  }
};

export const buildTaskDigest = (input: {
  task: PersistedTask;
  summary: string;
  artifacts: ArtifactRecord[];
  lastUpdatedBy: string;
  openQuestions?: string[];
  activeRisks?: string[];
  decisions?: string[];
  currentPlan?: string[];
  verificationState?: string;
  droidspeak?: TaskStateDigest['droidspeak'];
}): TaskStateDigest => ({
  id: randomUUID(),
  taskId: input.task.taskId,
  runId: input.task.runId,
  projectId: input.task.projectId ?? 'droidswarm',
  objective: input.task.name,
  currentPlan: input.currentPlan ?? [input.summary],
  decisions: input.decisions ?? [],
  openQuestions: input.openQuestions ?? [],
  activeRisks: input.activeRisks ?? [],
  artifactIndex: input.artifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    summary: artifact.summary,
  })),
  verificationState: input.verificationState ?? input.task.status,
  lastUpdatedBy: input.lastUpdatedBy,
  ts: new Date().toISOString(),
  droidspeak: input.droidspeak,
});

export const buildHandoffPacket = (input: {
  task: PersistedTask;
  fromTaskId: string;
  toTaskId?: string;
  toRole: string;
  digest: TaskStateDigest;
  requiredReads: string[];
  summary: string;
  droidspeak?: HandoffPacket['droidspeak'];
}): HandoffPacket => ({
  id: randomUUID(),
  taskId: input.task.taskId,
  runId: input.task.runId,
  projectId: input.task.projectId ?? 'droidswarm',
  fromTaskId: input.fromTaskId,
  toTaskId: input.toTaskId,
  toRole: input.toRole,
  digestId: input.digest.id,
  requiredReads: input.requiredReads,
  summary: input.summary,
  ts: new Date().toISOString(),
  droidspeak: input.droidspeak,
});
