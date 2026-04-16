import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';

export class LocalLlamaAdapter implements WorkerAdapter {
  readonly engine = 'local-llama' as const;
  readonly supportsHeartbeats = true;

  constructor(private readonly options: { baseUrl: string; timeoutMs: number }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/completion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: buildWorkerPrompt(request),
          n_predict: 1024,
          temperature: 0.2,
          stop: ['\n\nEND_JSON'],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`llama.cpp request failed (${response.status})`);
      }
      const payload = await response.json() as { content?: string };
      return parseWorkerResult(payload.content ?? '', this.engine, request.model ?? 'llama.cpp/default', Date.now() - startedAt);
    } catch (error) {
      return {
        success: false,
        engine: this.engine,
        model: request.model ?? 'llama.cpp/default',
        summary: error instanceof Error ? error.message : 'llama.cpp execution failed',
        timedOut: error instanceof Error && error.name === 'AbortError',
        durationMs: Date.now() - startedAt,
        activity: { filesRead: [], filesChanged: [], commandsRun: [], toolCalls: [] },
        checkpointDelta: { factsAdded: [], decisionsAdded: [], openQuestions: [], risksFound: ['llama_exec_failed'], nextBestActions: [], evidenceRefs: [] },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: 'llama_exec_failed',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const buildWorkerPrompt = (request: WorkerRequest): string => [
  request.instructions,
  '',
  'Respond with JSON only matching:',
  JSON.stringify({
    summary: 'string',
    success: true,
    factsAdded: ['string'],
    decisionsAdded: ['string'],
    openQuestions: ['string'],
    risksFound: ['string'],
    nextBestActions: ['string'],
    evidenceRefs: ['string'],
    spawnRequests: [{ role: 'string', reason: 'string', instructions: 'string' }],
  }, null, 2),
  'END_JSON',
].join('\n');

const parseWorkerResult = (content: string, engine: WorkerResult['engine'], model: string, durationMs: number): WorkerResult => {
  const normalized = content.trim().replace(/END_JSON\s*$/, '').trim();
  const parsed = JSON.parse(normalized) as {
    summary?: string;
    success?: boolean;
    factsAdded?: string[];
    decisionsAdded?: string[];
    openQuestions?: string[];
    risksFound?: string[];
    nextBestActions?: string[];
    evidenceRefs?: string[];
    spawnRequests?: WorkerResult['spawnRequests'];
  };
  return {
    success: parsed.success ?? true,
    engine,
    model,
    summary: parsed.summary ?? normalized,
    timedOut: false,
    durationMs,
    activity: {
      filesRead: [],
      filesChanged: [],
      commandsRun: [],
      toolCalls: [],
    },
    checkpointDelta: {
      factsAdded: parsed.factsAdded ?? [],
      decisionsAdded: parsed.decisionsAdded ?? [],
      openQuestions: parsed.openQuestions ?? [],
      risksFound: parsed.risksFound ?? [],
      nextBestActions: parsed.nextBestActions ?? [],
      evidenceRefs: parsed.evidenceRefs ?? [],
    },
    artifacts: [],
    spawnRequests: parsed.spawnRequests ?? [],
    budget: {},
  };
};
