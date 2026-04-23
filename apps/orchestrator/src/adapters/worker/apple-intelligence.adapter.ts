import type { WorkerArtifact, WorkerResult } from '../../types';
import type { SpawnRequest } from '@shared-types';
import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import { tracer } from '@shared-tracing';

interface AppleIntelligenceClientLike {
  processTask?(sessionId: string, name: string, payload: Record<string, unknown>): Promise<{ data: unknown }>;
  runStructuredTask?(input: {
    sessionId: string;
    name: string;
    payload: Record<string, unknown>;
  }): Promise<{ data: unknown }>;
}

interface AppleStructuredResponse {
  summary?: string;
  success?: boolean;
  factsAdded?: string[];
  decisionsAdded?: string[];
  openQuestions?: string[];
  risksFound?: string[];
  nextBestActions?: string[];
  evidenceRefs?: string[];
  spawnRequests?: SpawnRequest[];
  artifacts?: WorkerArtifact[];
  toolCalls?: Array<{
    tool: string;
    summary?: string;
    input?: unknown;
    output?: unknown;
  }>;
  sessionMemory?: {
    summary?: string;
    notes?: string[];
  };
  metadata?: Record<string, unknown>;
}

type SessionMemory = {
  summary?: string;
  notes: string[];
};

const sessionMemory = new Map<string, SessionMemory>();

const jsonResponseSchema = {
  type: 'object',
  required: ['summary', 'success'],
  properties: {
    summary: { type: 'string' },
    success: { type: 'boolean' },
    factsAdded: { type: 'array', items: { type: 'string' } },
    decisionsAdded: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    risksFound: { type: 'array', items: { type: 'string' } },
    nextBestActions: { type: 'array', items: { type: 'string' } },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
    spawnRequests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['role', 'reason', 'instructions'],
        properties: {
          role: { type: 'string' },
          reason: { type: 'string' },
          instructions: { type: 'string' },
        },
      },
    },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'summary'],
        properties: {
          kind: { type: 'string' },
          summary: { type: 'string' },
          path: { type: 'string' },
          uri: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
    toolCalls: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tool'],
        properties: {
          tool: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
    sessionMemory: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        notes: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const asStringArray = (input: unknown): string[] =>
  Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];

const asSpawnRequests = (input: unknown): SpawnRequest[] =>
  Array.isArray(input)
    ? input.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.role !== 'string' || typeof record.reason !== 'string' || typeof record.instructions !== 'string') {
        return [];
      }
      return [{
        role: record.role,
        reason: record.reason,
        instructions: record.instructions,
      }];
    })
    : [];

const asArtifacts = (input: unknown): WorkerArtifact[] =>
  Array.isArray(input)
    ? input.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.kind !== 'string' || typeof record.summary !== 'string') {
        return [];
      }
      return [{
        kind: record.kind,
        summary: record.summary,
        path: typeof record.path === 'string' ? record.path : undefined,
        uri: typeof record.uri === 'string' ? record.uri : undefined,
        content: typeof record.content === 'string' ? record.content : undefined,
      }];
    })
    : [];

const parseStructuredResponse = (data: unknown): AppleStructuredResponse => {
  if (typeof data === 'string') {
    return {
      summary: data,
      success: true,
    };
  }
  if (!data || typeof data !== 'object') {
    return {
      summary: 'Apple Intelligence completed the task.',
      success: true,
    };
  }

  const record = data as Record<string, unknown>;
  return {
    summary: typeof record.summary === 'string' ? record.summary : JSON.stringify(data),
    success: typeof record.success === 'boolean' ? record.success : true,
    factsAdded: asStringArray(record.factsAdded),
    decisionsAdded: asStringArray(record.decisionsAdded),
    openQuestions: asStringArray(record.openQuestions),
    risksFound: asStringArray(record.risksFound),
    nextBestActions: asStringArray(record.nextBestActions),
    evidenceRefs: asStringArray(record.evidenceRefs),
    spawnRequests: asSpawnRequests(record.spawnRequests),
    artifacts: asArtifacts(record.artifacts),
    toolCalls: Array.isArray(record.toolCalls)
      ? record.toolCalls.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }
        const toolCall = entry as Record<string, unknown>;
        if (typeof toolCall.tool !== 'string') {
          return [];
        }
        return [{
          tool: toolCall.tool,
          summary: typeof toolCall.summary === 'string' ? toolCall.summary : undefined,
          input: toolCall.input,
          output: toolCall.output,
        }];
      })
      : [],
    sessionMemory: record.sessionMemory && typeof record.sessionMemory === 'object'
      ? {
        summary: typeof (record.sessionMemory as Record<string, unknown>).summary === 'string'
          ? (record.sessionMemory as Record<string, unknown>).summary as string
          : undefined,
        notes: asStringArray((record.sessionMemory as Record<string, unknown>).notes),
      }
      : undefined,
    metadata: record.metadata && typeof record.metadata === 'object'
      ? record.metadata as Record<string, unknown>
      : undefined,
  };
};

const getSessionKey = (request: WorkerRequest): string =>
  `${request.scope.projectId}:${request.runId}:${request.taskId}:${request.role}`;

export class AppleIntelligenceWorkerAdapter implements WorkerAdapter {
  readonly engine = 'apple-intelligence' as const;
  readonly supportsHeartbeats = false;

  constructor(private readonly input: {
    model?: string;
    sdkEnabled?: boolean;
    preferredByHost?: boolean;
    availableTools?: string[];
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

    const sessionId = getSessionKey(request);
    const priorSessionMemory = sessionMemory.get(sessionId) ?? { notes: [] };
    const payload = {
      instructions: request.instructions,
      scope: request.scope,
      context: request.context,
      responseFormat: {
        type: 'json_schema',
        schema: jsonResponseSchema,
      },
      tools: (this.input.availableTools ?? []).map((tool) => ({
        name: tool,
        type: 'function',
      })),
      sessionMemory: priorSessionMemory,
      capabilities: {
        toolCalling: true,
        structuredOutput: true,
        sessionMemory: true,
        preferredByHost: this.input.preferredByHost === true,
      },
    } satisfies Record<string, unknown>;

    try {
      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'start',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
        toolCount: this.input.availableTools?.length ?? 0,
        preferredByHost: this.input.preferredByHost === true,
      });

      const response = typeof client.runStructuredTask === 'function'
        ? await client.runStructuredTask({
          sessionId,
          name: request.role,
          payload,
        })
        : await client.processTask?.(sessionId, request.role, payload);

      if (!response) {
        throw new Error('Apple Intelligence client did not return a response.');
      }

      const structured = parseStructuredResponse(response.data);
      const durationMs = Date.now() - startedAt;
      sessionMemory.set(sessionId, {
        summary: structured.sessionMemory?.summary ?? structured.summary,
        notes: structured.sessionMemory?.notes ?? [
          ...priorSessionMemory.notes.slice(-4),
          structured.summary ?? 'Apple Intelligence completed a task.',
        ],
      });

      tracer.audit('APPLE_INTELLIGENCE_CALL', {
        phase: 'success',
        runId: request.runId,
        taskId: request.taskId,
        role: request.role,
        model,
        durationMs,
        toolCallCount: structured.toolCalls?.length ?? 0,
      });

      return {
        success: structured.success ?? true,
        engine: this.engine,
        model,
        summary: structured.summary ?? 'Apple Intelligence completed the task.',
        timedOut: false,
        durationMs,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: (structured.toolCalls ?? []).map((entry) => ({
            tool: entry.tool,
            summary: entry.summary ?? `Apple Intelligence used ${entry.tool}.`,
          })),
        },
        checkpointDelta: {
          factsAdded: structured.factsAdded ?? [],
          decisionsAdded: structured.decisionsAdded ?? [],
          openQuestions: structured.openQuestions ?? [],
          risksFound: structured.risksFound ?? [],
          nextBestActions: structured.nextBestActions ?? [],
          evidenceRefs: structured.evidenceRefs ?? [],
        },
        artifacts: structured.artifacts ?? [],
        spawnRequests: structured.spawnRequests ?? [],
        budget: {},
        metadata: {
          preferredByHost: this.input.preferredByHost === true,
          sessionId,
          sessionMemory: sessionMemory.get(sessionId),
          responseFormat: 'json_schema',
          ...(structured.metadata ?? {}),
        },
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
          sessionId,
        },
      };
    }
  }
}
