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
      const content = await requestLlamaResponse(
        this.options.baseUrl,
        request,
        controller.signal,
      );
      return parseWorkerResult(content, this.engine, request.model ?? 'llama.cpp/default', Date.now() - startedAt);
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

const requestLlamaResponse = async (
  baseUrl: string,
  request: WorkerRequest,
  signal: AbortSignal,
): Promise<string> => {
  const root = baseUrl.replace(/\/$/, '');
  const prompt = buildWorkerPrompt(request);
  const model = request.model ?? 'default';
  const attempts: Array<{
    path: string;
    body: Record<string, unknown>;
    extract: (payload: unknown) => string | undefined;
  }> = [
    {
      path: '/completion',
      body: {
        prompt,
        n_predict: 1024,
        temperature: 0.2,
        stop: ['\n\nEND_JSON'],
      },
      extract: (payload) => {
        if (typeof payload !== 'object' || payload === null) {
          return undefined;
        }
        const content = (payload as { content?: unknown }).content;
        return typeof content === 'string' ? content : undefined;
      },
    },
    {
      path: '/v1/completions',
      body: {
        model,
        prompt,
        max_tokens: 1024,
        temperature: 0.2,
        stop: ['\n\nEND_JSON'],
      },
      extract: extractOpenAICompletionText,
    },
    {
      path: '/v1/chat/completions',
      body: {
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1024,
        temperature: 0.2,
        stop: ['\n\nEND_JSON'],
      },
      extract: extractOpenAIChatText,
    },
  ];

  const failures: string[] = [];
  for (const attempt of attempts) {
    const response = await fetch(`${root}${attempt.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(attempt.body),
      signal,
    });

    if (response.ok) {
      const payload = await response.json() as unknown;
      const content = attempt.extract(payload);
      if (typeof content === 'string' && content.trim().length > 0) {
        return content;
      }
      failures.push(`${attempt.path} returned an empty response payload`);
      continue;
    }

    if (response.status === 404) {
      failures.push(`${attempt.path} returned 404`);
      continue;
    }

    throw new Error(`llama.cpp request failed (${response.status}) on ${attempt.path}`);
  }

  throw new Error(`llama.cpp request failed (${failures.join('; ')})`);
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
  'END_JSON',
].join('\n');

const extractOpenAICompletionText = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const text = (choices[0] as { text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
};

const extractOpenAIChatText = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part !== 'object' || part === null) {
          return '';
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      })
      .filter(Boolean)
      .join('');
  }

  return undefined;
};

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
