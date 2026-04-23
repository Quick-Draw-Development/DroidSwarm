import { spawn } from 'node:child_process';

import { tracer } from '@shared-tracing';

type WorkerMode = 'worker' | 'verifier';

const REMOTE_ENV_KEYS = [
  'DROIDSWARM_DEBUG',
  'DROIDSWARM_PROJECT_ID',
  'DROIDSWARM_PROJECT_NAME',
  'DROIDSWARM_SOCKET_URL',
  'DROIDSWARM_SOCKET_HOST',
  'DROIDSWARM_SOCKET_PORT',
  'DROIDSWARM_SPECS_DIR',
  'DROIDSWARM_OPERATOR_TOKEN',
  'DROIDSWARM_CODEX_API_BASE_URL',
  'DROIDSWARM_CODEX_API_KEY',
  'DROIDSWARM_CODEX_MODEL',
  'DROIDSWARM_CODEX_CLOUD_MODEL',
  'DROIDSWARM_LLAMA_BASE_URL',
  'DROIDSWARM_LLAMA_MODEL',
  'DROIDSWARM_FEDERATION_NODE_ID',
] as const;

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

export const buildRemoteShellCommand = (remoteCommand: string, remoteEntry: string, args: string[], environment: NodeJS.ProcessEnv): string => {
  const projectedEnvironment = REMOTE_ENV_KEYS
    .flatMap((key) => {
      const value = environment[key];
      return typeof value === 'string' && value.length > 0
        ? [`${key}=${shellQuote(value)}`]
        : [];
    })
    .join(' ');

  const quotedCommand = [remoteCommand, remoteEntry, ...args].map((value) => shellQuote(value)).join(' ');
  return projectedEnvironment.length > 0
    ? `${projectedEnvironment} ${quotedCommand}`
    : quotedCommand;
};

export class WorkerRunner {
  async start(): Promise<void> {
    const mode = this.parseMode();
    const entry = this.resolveEntry(mode);
    tracer.audit('CODE_EXEC_START', {
      mode,
      entry,
      remoteSerial: process.env.DROIDSWARM_FEDERATION_REMOTE_SERIAL,
      remoteEntry: process.env.DROIDSWARM_FEDERATION_REMOTE_ENTRY,
    });
    const exitCode = await this.runChild(entry);
    tracer.audit('CODE_EXEC_COMPLETE', {
      mode,
      entry,
      exitCode,
      remoteSerial: process.env.DROIDSWARM_FEDERATION_REMOTE_SERIAL,
      remoteEntry: process.env.DROIDSWARM_FEDERATION_REMOTE_ENTRY,
    });
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
      const remoteSerial = process.env.DROIDSWARM_FEDERATION_REMOTE_SERIAL;
      const remoteEntry = process.env.DROIDSWARM_FEDERATION_REMOTE_ENTRY;
      const remoteCommand = process.env.DROIDSWARM_FEDERATION_REMOTE_COMMAND ?? 'node';
      const adbBin = process.env.DROIDSWARM_FEDERATION_ADB_BIN ?? 'adb';
      const remoteShellCommand = remoteSerial && remoteEntry
        ? buildRemoteShellCommand(remoteCommand, remoteEntry, process.argv.slice(2), process.env)
        : undefined;
      const child = remoteSerial && remoteEntry
        ? spawn(adbBin, ['-s', remoteSerial, 'shell', remoteShellCommand ?? ''], {
          env: process.env,
          stdio: 'inherit',
        })
        : spawn(process.execPath, [entry, ...process.argv.slice(2)], {
          env: process.env,
          stdio: 'inherit',
        });

      child.on('error', (error) => {
        tracer.audit('CODE_EXEC_ERROR', {
          entry,
          remoteSerial,
          remoteEntry,
          message: error.message,
        });
        reject(error);
      });
      child.on('exit', (code, signal) => {
        if (signal) {
          tracer.audit('CODE_EXEC_SIGNAL_EXIT', {
            entry,
            remoteSerial,
            remoteEntry,
            signal,
          });
          reject(new Error(`Worker child exited from signal ${signal}.`));
          return;
        }
        resolve(code ?? 1);
      });
    });
  }
}
