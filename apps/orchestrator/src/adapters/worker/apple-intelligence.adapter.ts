import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';
import { AppleIntelligenceClient } from '@apple-intelligence/sdk';

export class AppleIntelligenceWorkerAdapter implements WorkerAdapter {
  readonly engine = 'apple-intelligence' as const;
  readonly supportsHeartbeats = false;

  constructor(private readonly input: { model?: string }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const startedAt = Date.now();
    const client = new AppleIntelligenceClient({
      model: request.model ?? this.input.model,
    });

    try {
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

      return {
        success: true,
        engine: this.engine,
        model: request.model ?? this.input.model ?? 'apple-intelligence/local',
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
          risksFound: [],
          nextBestActions: [],
          evidenceRefs: [],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
      };
    } catch (error) {
      return {
        success: false,
        engine: this.engine,
        model: request.model ?? this.input.model ?? 'apple-intelligence/local',
        summary: error instanceof Error ? error.message : 'Apple Intelligence execution failed.',
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
