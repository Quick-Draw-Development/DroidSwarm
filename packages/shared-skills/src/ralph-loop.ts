import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { chooseBackendDecision } from '@model-router';
import {
  createLongTermMemory,
  retrieveRelevantMemories,
} from '@shared-memory';
import {
  getRalphWorkerSession,
  listRalphWorkerSessions,
  upsertRalphWorkerSession,
  type RalphWorkerSessionRecord,
} from '@shared-projects';
import { appendAuditEvent } from '@shared-tracing';
import { runConsensusRound, validateCompliance } from '@shared-governance';

export interface RalphLoopConfig {
  maxIterations: number;
  completionSignal: string;
  sleepMs: number;
}

export interface StartRalphWorkerInput {
  projectId: string;
  goal: string;
  workerName?: string;
  loopConfig?: Partial<RalphLoopConfig>;
  metadata?: Record<string, unknown>;
  spawnDetached?: boolean;
  workspaceRoot?: string;
}

const DEFAULT_LOOP_CONFIG: RalphLoopConfig = {
  maxIterations: 50,
  completionSignal: '<RALPH_DONE>',
  sleepMs: 5_000,
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const ralphEnabled = (): boolean =>
  ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_ENABLE_RALPH ?? '').toLowerCase());

const normalizeLoopConfig = (input?: Partial<RalphLoopConfig>): RalphLoopConfig => ({
  maxIterations: Math.max(1, input?.maxIterations ?? DEFAULT_LOOP_CONFIG.maxIterations),
  completionSignal: input?.completionSignal?.trim() || DEFAULT_LOOP_CONFIG.completionSignal,
  sleepMs: Math.max(0, input?.sleepMs ?? DEFAULT_LOOP_CONFIG.sleepMs),
});

const detectRalphSignals = (goal: string, metadata?: Record<string, unknown>) => {
  const combined = `${goal} ${String(metadata?.phase ?? '')} ${String(metadata?.mode ?? '')}`.toLowerCase();
  return {
    selfCorrectionNeeded:
      metadata?.selfCorrectionNeeded === true
      || /self-correct|retry|recover|failure|stabilize/.test(combined),
    longHorizon:
      metadata?.longHorizon === true
      || /long-horizon|multi-day|multi-hour|persistent|iterative/.test(combined),
    polishingPhase:
      metadata?.polishingPhase === true
      || /polish|refine|review follow-up|research synthesis|hardening/.test(combined),
    failureRecoveryMode:
      metadata?.failureRecoveryMode === true
      || /recover|postmortem|failed|retry/.test(combined),
    expectedIterations:
      typeof metadata?.expectedIterations === 'number'
        ? metadata.expectedIterations
        : /iterative|persistent|refine|polish/.test(combined)
          ? 12
          : 4,
  };
};

const maybeRunGovernanceGate = (session: RalphWorkerSessionRecord): {
  halted: boolean;
  consensusId?: string;
} => {
  const requiresConsensus = session.maxIterations > 8 || session.metadata.criticalPath === true;
  if (!requiresConsensus || session.governanceConsensusId) {
    return {
      halted: false,
      consensusId: session.governanceConsensusId,
    };
  }

  const consensus = runConsensusRound({
    proposalType: 'agent-spawn',
    title: `Persistent Ralph loop for ${session.projectId}`,
    summary: session.goal,
    glyph: 'RALPH_ITERATION',
    context: {
      eventType: 'worker-host.start',
      actorRole: 'ralph-wiggum-worker',
      swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
      projectId: session.projectId,
      auditLoggingEnabled: true,
      dashboardEnabled: true,
      droidspeakState: {
        compact: 'RALPH_ITERATION',
        expanded: session.goal,
        kind: 'memory_pinned',
      },
    },
  });

  if (!consensus.approved) {
    upsertRalphWorkerSession({
      ...session,
      status: 'halted',
      governanceConsensusId: consensus.consensusId,
      lastError: 'Guardian or quorum halted the Ralph worker session.',
      metadata: {
        ...session.metadata,
        governance: 'halted',
      },
    });
    return {
      halted: true,
      consensusId: consensus.consensusId,
    };
  }

  return {
    halted: false,
    consensusId: consensus.consensusId,
  };
};

const synthesizeIteration = (session: RalphWorkerSessionRecord): {
  summary: string;
  currentTask: string;
  completed: boolean;
  engine: string;
  routeKind: string;
} => {
  const memories = retrieveRelevantMemories({
    projectId: session.projectId,
    query: session.goal,
    limit: 4,
  });
  const routingSignals = detectRalphSignals(session.goal, session.metadata);
  const backendDecision = chooseBackendDecision({
    taskType: 'ralph-persistent-loop',
    stage: 'iterative-refinement',
    summary: session.goal,
    contextLength: session.goal.length + memories.reduce((count, memory) => count + memory.englishTranslation.length, 0),
    mythosAvailable: process.env.DROIDSWARM_ENABLE_MYTHOS === 'true' || process.env.DROIDSWARM_ENABLE_MYTHOS === '1',
  });
  const nextIteration = session.iterationCount + 1;
  const focus = memories[0]?.englishTranslation
    ?? `Re-check the highest-value path for: ${session.goal}`;
  const summary = [
    `Iteration ${nextIteration} revisited the goal with a fresh context window.`,
    `Focus: ${focus}.`,
    memories.length > 0
      ? `Recovered ${memories.length} durable memories before acting.`
      : 'No durable memories matched yet, so the loop kept the goal and latest summary only.',
    routingSignals.selfCorrectionNeeded
      ? 'The loop stayed in self-correction mode and tightened the next step.'
      : 'The loop generated the next refinement step from current evidence.',
  ].join(' ');
  const autoCompleteAfter =
    typeof session.metadata.autoCompleteAfter === 'number'
      ? Math.max(1, session.metadata.autoCompleteAfter)
      : undefined;
  const completed = autoCompleteAfter != null
    ? nextIteration >= autoCompleteAfter
    : nextIteration >= session.maxIterations;
  return {
    summary: completed ? `${summary} ${session.completionSignal}` : summary,
    currentTask: focus,
    completed,
    engine: backendDecision.backend,
    routeKind: 'ralph-persistent-loop',
  };
};

export const listRalphWorkers = (projectId?: string): RalphWorkerSessionRecord[] =>
  listRalphWorkerSessions(projectId ? { projectId } : undefined);

export const getRalphWorkerStatus = (sessionId: string): RalphWorkerSessionRecord | undefined =>
  getRalphWorkerSession(sessionId);

export const pauseRalphWorker = (sessionId: string): RalphWorkerSessionRecord => {
  const session = getRalphWorkerSession(sessionId);
  if (!session) {
    throw new Error(`Unknown Ralph worker session: ${sessionId}`);
  }
  const updated = upsertRalphWorkerSession({
    ...session,
    status: 'paused',
    pausedAt: new Date().toISOString(),
  });
  appendAuditEvent('RALPH_PAUSE', {
    sessionId,
    projectId: updated.projectId,
    iterationCount: updated.iterationCount,
  });
  return updated;
};

const resolveCliPath = (workspaceRoot?: string): string =>
  path.resolve(workspaceRoot ?? process.env.DROIDSWARM_WORKSPACE_ROOT ?? process.cwd(), 'packages/shared-skills/src/cli.ts');

const spawnDetachedRunner = (sessionId: string, workspaceRoot?: string): void => {
  const child = spawn(process.execPath, ['--import', 'tsx', resolveCliPath(workspaceRoot), 'ralph-run', '--session-id', sessionId], {
    cwd: workspaceRoot ?? process.env.DROIDSWARM_WORKSPACE_ROOT ?? process.cwd(),
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
};

export const startRalphWorker = (input: StartRalphWorkerInput): RalphWorkerSessionRecord => {
  if (!ralphEnabled()) {
    throw new Error('Ralph workers are disabled. Set DROIDSWARM_ENABLE_RALPH=true.');
  }
  const loopConfig = normalizeLoopConfig(input.loopConfig);
  const workerName = input.workerName ?? `ralph-wiggum-worker-${Date.now()}`;
  const session = upsertRalphWorkerSession({
    sessionId: randomUUID(),
    projectId: input.projectId,
    workerName,
    goal: input.goal,
    status: 'running',
    maxIterations: loopConfig.maxIterations,
    completionSignal: loopConfig.completionSignal,
    sleepMs: loopConfig.sleepMs,
    metadata: input.metadata ?? {},
    assignedNodeId: process.env.DROIDSWARM_FEDERATION_NODE_ID,
  });
  appendAuditEvent('RALPH_ITERATION', {
    sessionId: session.sessionId,
    projectId: session.projectId,
    workerName: session.workerName,
    iteration: 0,
    status: 'started',
  });
  const shouldSpawnDetached = input.spawnDetached ?? process.env.DROIDSWARM_RALPH_SPAWN_DETACHED !== '0';
  if (shouldSpawnDetached) {
    spawnDetachedRunner(session.sessionId, input.workspaceRoot);
  }
  return session;
};

export const resumeRalphWorker = (
  sessionId: string,
  options?: { spawnDetached?: boolean; workspaceRoot?: string },
): RalphWorkerSessionRecord => {
  const session = getRalphWorkerSession(sessionId);
  if (!session) {
    throw new Error(`Unknown Ralph worker session: ${sessionId}`);
  }
  const updated = upsertRalphWorkerSession({
    ...session,
    status: 'running',
    pausedAt: undefined,
    lastError: undefined,
  });
  const shouldSpawnDetached = options?.spawnDetached ?? process.env.DROIDSWARM_RALPH_SPAWN_DETACHED !== '0';
  if (shouldSpawnDetached) {
    spawnDetachedRunner(sessionId, options?.workspaceRoot);
  }
  return updated;
};

export const runRalphIteration = async (sessionId: string): Promise<RalphWorkerSessionRecord> => {
  const session = getRalphWorkerSession(sessionId);
  if (!session) {
    throw new Error(`Unknown Ralph worker session: ${sessionId}`);
  }
  if (session.status !== 'running') {
    return session;
  }

  const compliance = validateCompliance({
    eventType: 'worker-host.start',
    actorRole: 'ralph-wiggum-worker',
    swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
    projectId: session.projectId,
    auditLoggingEnabled: true,
    dashboardEnabled: true,
    droidspeakState: {
      compact: 'RALPH_ITERATION',
      expanded: session.goal,
      kind: 'memory_pinned',
    },
  });
  if (!compliance.ok) {
    return upsertRalphWorkerSession({
      ...session,
      status: 'halted',
      lastError: compliance.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '),
    });
  }

  const governance = maybeRunGovernanceGate(session);
  if (governance.halted) {
    return getRalphWorkerSession(sessionId) ?? upsertRalphWorkerSession({
      ...session,
      status: 'halted',
    });
  }
  const iteration = synthesizeIteration(session);
  const nextIteration = session.iterationCount + 1;
  createLongTermMemory({
    projectId: session.projectId,
    memoryType: 'procedural',
    droidspeakSummary: `RALPH_ITERATION ${nextIteration}`,
    englishTranslation: iteration.summary,
    sourceRunId: session.sessionId,
    relevanceScore: 0.82,
    metadata: {
      worker: session.workerName,
      iteration: nextIteration,
      routeKind: iteration.routeKind,
      engine: iteration.engine,
    },
  });
  appendAuditEvent(iteration.completed ? 'RALPH_DONE' : 'RALPH_ITERATION', {
    sessionId: session.sessionId,
    projectId: session.projectId,
    iteration: nextIteration,
    engine: iteration.engine,
    routeKind: iteration.routeKind,
    summary: iteration.summary,
  });
  return upsertRalphWorkerSession({
    ...session,
    status: iteration.completed ? 'completed' : 'running',
    iterationCount: nextIteration,
    engine: iteration.engine,
    routeKind: iteration.routeKind,
    currentTask: iteration.currentTask,
    lastSummary: iteration.summary,
    governanceConsensusId: governance.consensusId,
    completedAt: iteration.completed ? new Date().toISOString() : undefined,
    metadata: {
      ...session.metadata,
      lastMemoryCount: retrieveRelevantMemories({
        projectId: session.projectId,
        query: session.goal,
        limit: 4,
      }).length,
    },
  });
};

export const runRalphLoop = async (sessionId: string): Promise<RalphWorkerSessionRecord> => {
  let session = getRalphWorkerSession(sessionId);
  if (!session) {
    throw new Error(`Unknown Ralph worker session: ${sessionId}`);
  }
  while (session.status === 'running') {
    session = await runRalphIteration(sessionId);
    if (session.status !== 'running') {
      return session;
    }
    await sleep(session.sleepMs);
    const refreshed = getRalphWorkerSession(sessionId);
    if (!refreshed) {
      throw new Error(`Ralph worker session disappeared: ${sessionId}`);
    }
    session = refreshed;
  }
  return session;
};
