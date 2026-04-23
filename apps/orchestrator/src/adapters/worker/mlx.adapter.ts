import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';

export class MlxAdapter implements WorkerAdapter {
  readonly engine = 'mlx' as const;
  readonly supportsHeartbeats = true;

  constructor(private readonly options: { baseUrl: string; timeoutMs: number }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const content = await requestMlxResponse(
        this.options.baseUrl,
        request,
        controller.signal,
      );
      return parseWorkerResult(content, this.engine, request.model ?? 'mlx/local', Date.now() - startedAt);
    } catch (error) {
      return {
        success: false,
        engine: this.engine,
        model: request.model ?? 'mlx/local',
        summary: error instanceof Error ? error.message : 'MLX execution failed',
        timedOut: error instanceof Error && error.name === 'AbortError',
        durationMs: Date.now() - startedAt,
        activity: { filesRead: [], filesChanged: [], commandsRun: [], toolCalls: [] },
        checkpointDelta: { factsAdded: [], decisionsAdded: [], openQuestions: [], risksFound: ['mlx_exec_failed'], nextBestActions: [], evidenceRefs: [] },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: 'mlx_exec_failed',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const requestMlxResponse = async (
  baseUrl: string,
  request: WorkerRequest,
  signal: AbortSignal,
): Promise<string> => {
  const root = baseUrl.replace(/\/$/, '');
  const prompt = buildWorkerPrompt(request);
  const model = request.model ?? 'mlx/local';
  const response = await fetch(`${root}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
      response_format: {
        type: 'json_object',
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`MLX request failed (${response.status})`);
  }

  const payload = await response.json() as unknown;
  const choices = typeof payload === 'object' && payload !== null ? (payload as { choices?: unknown }).choices : undefined;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('MLX returned no choices');
  }

  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    throw new Error('MLX returned no message');
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content;
  }

  throw new Error('MLX returned an empty response payload');
};

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
].join('\n');

const parseWorkerResult = (content: string, engine: WorkerResult['engine'], model: string, durationMs: number): WorkerResult => {
  const parsed = JSON.parse(content.trim()) as {
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
    summary: parsed.summary ?? content.trim(),
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
