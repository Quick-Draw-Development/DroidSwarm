import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';
import { runCodexPrompt } from '../../codex-runner';
import { normalizeLegacyCodexResult } from '@shared-workers';

export class CodexCliAdapter implements WorkerAdapter {
  readonly engine = 'codex-cli' as const;
  readonly supportsHeartbeats = true;

  constructor(private readonly input: { config: unknown; projectRoot: string }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const legacy = await runCodexPrompt({
      config: this.input.config as never,
      projectRoot: request.scope.workspaceId ? this.input.projectRoot : request.scope.rootPath,
      prompt: request.instructions,
      model: request.model,
    });
    return normalizeLegacyCodexResult(legacy, this.engine, request.model ?? 'codex-cli/coder');
  }
}
