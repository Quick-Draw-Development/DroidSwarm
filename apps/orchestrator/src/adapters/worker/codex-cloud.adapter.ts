import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';
import { normalizeLegacyCodexResult } from '@shared-workers';

export class CodexCloudAdapter implements WorkerAdapter {
  readonly engine = 'codex-cloud' as const;
  readonly supportsHeartbeats = false;

  constructor(private readonly input: { apiBaseUrl?: string; apiKey?: string; model?: string }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    if (!this.input.apiKey) {
      throw new Error('Missing Codex cloud API key.');
    }
    const startedAt = Date.now();
    const response = await fetch(`${(this.input.apiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.input.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model ?? this.input.model ?? 'gpt-5-codex',
        input: [
          {
            role: 'user',
            content: request.instructions,
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Codex cloud request failed (${response.status})`);
    }
    const payload = await response.json() as {
      output_text?: string;
    };
    const legacy = {
      status: 'completed' as const,
      summary: payload.output_text ?? 'Codex cloud execution completed.',
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
      metrics: {
        duration_ms: Date.now() - startedAt,
      },
    };
    return normalizeLegacyCodexResult(legacy, this.engine, request.model);
  }
}
