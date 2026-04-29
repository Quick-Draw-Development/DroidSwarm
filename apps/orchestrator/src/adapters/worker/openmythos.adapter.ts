import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';
import { OpenMythosAdapter as MythosBridgeAdapter } from '@mythos-engine';
import { evaluateRecurrentEngineStability, runConsensusRound, validateCompliance } from '@shared-governance';

export class OpenMythosWorkerAdapter implements WorkerAdapter {
  readonly engine = 'openmythos' as const;
  readonly supportsHeartbeats = false;

  constructor(private readonly input: { model?: string; defaultLoops: number; maxLoops: number }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const startedAt = Date.now();
    const bridge = new MythosBridgeAdapter();
    const requestedLoops = Math.min(this.input.maxLoops, inferLoops(request, this.input.defaultLoops));
    const spectralRadius = await bridge.computeSpectralRadius();
    const driftScore = await bridge.checkDrift(request.instructions);
    const stability = evaluateRecurrentEngineStability({
      recurrentEngine: 'openmythos',
      spectralRadius,
      requestedLoops,
      driftScore,
    });

    runConsensusRound({
      proposalType: 'human-override',
      title: `OpenMythos execution for ${request.role}`,
      summary: `Spectral radius ${spectralRadius.toFixed(3)} with requested loops ${requestedLoops}.`,
      glyph: 'MYTHOS_STATUS',
      context: {
        eventType: 'mythos.execute',
        actorRole: request.role,
        swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
        projectId: request.scope.projectId,
        auditLoggingEnabled: true,
        dashboardEnabled: false,
        recurrentEngine: 'openmythos',
        spectralRadius,
        requestedLoops,
        driftScore,
        droidspeakState: {
          compact: 'MYTHOS_STATUS',
          expanded: `spectral=${spectralRadius.toFixed(3)} loops=${requestedLoops}`,
          kind: 'memory_pinned',
        },
      },
    });

    const compliance = validateCompliance({
      eventType: 'mythos.execute',
      actorRole: request.role,
      swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
      projectId: request.scope.projectId,
      auditLoggingEnabled: true,
      dashboardEnabled: false,
      recurrentEngine: 'openmythos',
      spectralRadius,
      requestedLoops,
      driftScore,
      droidspeakState: {
        compact: 'MYTHOS_STATUS',
        expanded: `spectral=${spectralRadius.toFixed(3)} loops=${requestedLoops}`,
        kind: 'memory_pinned',
      },
    }, 'LAW-099');

    if (!compliance.ok || stability.action === 'halt_and_rollback') {
      return {
        success: false,
        engine: this.engine,
        model: request.model ?? this.input.model ?? 'openmythos/local',
        summary: 'OpenMythos execution halted by LAW-099 spectral stability enforcement.',
        timedOut: false,
        durationMs: Date.now() - startedAt,
        activity: { filesRead: [], filesChanged: [], commandsRun: [], toolCalls: [] },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: ['mythos_spectral_unstable'],
          nextBestActions: ['Fallback to Apple Intelligence or llama.cpp for this task.'],
          evidenceRefs: [],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          spectralRadius,
          driftScore,
          requestedLoops,
          lawAction: stability.action,
        },
      };
    }

    const effectiveLoops = stability.action === 'throttle' ? Math.min(requestedLoops, 8) : requestedLoops;
    const result = await bridge.run({
      prompt: request.instructions,
      maxTokens: 1024,
      loops: effectiveLoops,
      temperature: 0.2,
    });

    return {
      success: result.success,
      engine: this.engine,
      model: request.model ?? this.input.model ?? 'openmythos/local',
      summary: result.summary,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      activity: {
        filesRead: [],
        filesChanged: [],
        commandsRun: [],
        toolCalls: [{ tool: 'openmythos', summary: `Executed ${effectiveLoops} recurrent loops.` }],
      },
      checkpointDelta: {
        factsAdded: result.factsAdded,
        decisionsAdded: result.decisionsAdded,
        openQuestions: result.openQuestions,
        risksFound: result.risksFound,
        nextBestActions: result.nextBestActions,
        evidenceRefs: result.evidenceRefs,
      },
      artifacts: [],
      spawnRequests: [],
      budget: {},
      metadata: {
        ...result.metadata,
        spectralRadius,
        driftScore,
        requestedLoops: effectiveLoops,
        lawAction: stability.action,
      },
    };
  }
}

const inferLoops = (request: WorkerRequest, fallback: number): number => {
  const summary = `${request.role} ${request.instructions}`.toLowerCase();
  if (summary.includes('code review') || summary.includes('long-horizon') || summary.includes('governance')) {
    return Math.max(fallback, 10);
  }
  if (summary.includes('deep') || summary.includes('recurrent')) {
    return Math.max(fallback, 8);
  }
  return fallback;
};
