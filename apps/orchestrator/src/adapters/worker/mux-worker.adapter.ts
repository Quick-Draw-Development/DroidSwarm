import type { WorkerAdapter, WorkerRequest } from '@shared-workers';
import type { WorkerResult } from '../../types';
import { spawn } from 'node:child_process';

export class MuxWorkerAdapter implements WorkerAdapter {
  readonly engine = 'mux-local' as const;
  readonly supportsHeartbeats = true;

  constructor(private readonly input: { command: string; args?: string[]; cwd?: string }) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    const startedAt = Date.now();
    const args = [...(this.input.args ?? []), request.instructions];
    const execution = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      const child = spawn(this.input.command, args, {
        cwd: this.input.cwd ?? request.scope.rootPath,
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    });
    return {
      success: execution.exitCode === 0,
      engine: this.engine,
      model: request.model,
      summary: execution.exitCode === 0 ? execution.stdout.trim() || 'Mux local worker completed.' : execution.stderr.trim() || 'Mux local worker failed.',
      timedOut: false,
      durationMs: Date.now() - startedAt,
      activity: {
        filesRead: [],
        filesChanged: [],
        commandsRun: [`${this.input.command} ${args.join(' ')}`],
        toolCalls: [],
      },
      checkpointDelta: {
        factsAdded: [],
        decisionsAdded: [],
        openQuestions: [],
        risksFound: execution.exitCode === 0 ? [] : ['mux_worker_failed'],
        nextBestActions: [],
        evidenceRefs: [],
      },
      artifacts: [],
      spawnRequests: [],
      budget: {},
    };
  }
}
