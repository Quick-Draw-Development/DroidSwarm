import { spawn } from 'node:child_process';

type WorkerMode = 'worker' | 'verifier';

export class WorkerRunner {
  async start(): Promise<void> {
    const mode = this.parseMode();
    const entry = this.resolveEntry(mode);
    const exitCode = await this.runChild(entry);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  }

  private parseMode(): WorkerMode {
    return process.argv[2] === 'verifier' ? 'verifier' : 'worker';
  }

  private resolveEntry(mode: WorkerMode): string {
    const orchestratorEntry = process.env.DROIDSWARM_ORCHESTRATOR_ENTRY;
    if (!orchestratorEntry) {
      throw new Error('Missing DROIDSWARM_ORCHESTRATOR_ENTRY for worker-host delegation.');
    }
    return orchestratorEntry;
  }

  private runChild(entry: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
        env: process.env,
        stdio: 'inherit',
      });

      child.on('error', reject);
      child.on('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`Worker child exited from signal ${signal}.`));
          return;
        }
        resolve(code ?? 1);
      });
    });
  }
}
