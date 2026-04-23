import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import { tracer } from '@shared-tracing';
import type { WorkerResult } from '../../types';

interface AppleIntelligenceClientLike {
  processTask(sessionId: string, name: string, payload: Record<string, unknown>): Promise<{ data: unknown }>;
}

export class AppleIntelligenceWorkerAdapter implements WorkerAdapter {
  readonly engine = 'apple-intelligence' as const;
  readonly supportsHeartbeats = false;

  constructor(private readonly input: {
    model?: string;
    sdkEnabled?: boolean;
    clientFactory?: (input: { model?: string }) => AppleIntelligenceClientLike;
  }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const startedAt = Date.now();
    const model = request.model ?? this.input.model ?? 'apple-intelligence/local';
    const unavailableResult = (summary: string, reasonCode: string): WorkerResult => ({
      success: false,
      engine: this.engine,
      model,
      summary,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      activity: {
        filesRead: [],
        filesChanged: [],
        commandsRun: [],
        toolCalls: [],
      },
      checkpointDelta: {
        factsAdded: [],
        decisionsAdded: [],
        openQuestions: [],
        risksFound: [reasonCode],
        nextBestActions: [],
        evidenceRefs: [],
      },
      artifacts: [],
      spawnRequests: [],
      budget: {},
      metadata: {
        reasonCode,
      },
    });

    const loadClient = (): AppleIntelligenceClientLike => {
      if (this.input.clientFactory) {
        return this.input.clientFactory({ model });
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('@apple-intelligence/sdk') as {
        AppleIntelligenceClient?: new (config?: { model?: string }) => AppleIntelligenceClientLike;
      };
      if (typeof sdk.AppleIntelligenceClient !== 'function') {
        throw new Error('Apple Intelligence SDK client is unavailable.');
      }
      return new sdk.AppleIntelligenceClient({ model });
    };

    if (this.input.sdkEnabled === false) {
      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'unavailable',
        reasonCode: 'apple_intelligence_unavailable',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
      });
      return unavailableResult(
        'Apple Intelligence is disabled or unavailable on this host.',
        'apple_intelligence_unavailable',
      );
    }

    let client: AppleIntelligenceClientLike;
    try {
      client = loadClient();
    } catch (error) {
      const summary = error instanceof Error ? error.message : 'Apple Intelligence SDK is unavailable.';
      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'unavailable',
        reasonCode: 'apple_intelligence_unavailable',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
        error: summary,
      });
      return unavailableResult(summary, 'apple_intelligence_unavailable');
    }

    try {
      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'start',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
      });
      const response = await client.processTask(
        request.runId,
        request.role,
        {
          instructions: request.instructions,
          scope: request.scope,
          context: request.context,
        },
      );

      const summary = typeof response?.data === 'string'
        ? response.data
        : JSON.stringify(response?.data ?? { summary: 'Apple Intelligence completed.' });
      const durationMs = Date.now() - startedAt;

      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'success',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
        durationMs,
      });

      return {
        success: true,
        engine: this.engine,
        model,
        summary,
        timedOut: false,
        durationMs,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: [],
        },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: [],
          nextBestActions: [],
          evidenceRefs: [],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
      };
    } catch (error) {
      const summary = error instanceof Error ? error.message : 'Apple Intelligence execution failed.';
      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'failure',
        reasonCode: 'apple_intelligence_failed',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
        error: summary,
      });
      return {
        success: false,
        engine: this.engine,
        model,
        summary,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: [],
        },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: ['apple_intelligence_failed'],
          nextBestActions: [],
          evidenceRefs: [],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: 'apple_intelligence_failed',
        },
      };
    }
  }
}
