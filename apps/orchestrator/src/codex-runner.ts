import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { CodexAgentResult, OrchestratorConfig } from './types';
import { codexAgentOutputSchema } from './codex-schema';

const createTempWorkspace = (): string => mkdtempSync(path.join(tmpdir(), 'droidswarm-codex-'));

export const runCodexPrompt = async (input: {
  config: OrchestratorConfig;
  prompt: string;
  projectRoot: string;
}): Promise<CodexAgentResult> => {
  const tempDir = createTempWorkspace();
  const schemaPath = path.join(tempDir, 'schema.json');
  const outputPath = path.join(tempDir, 'result.json');

  writeFileSync(schemaPath, JSON.stringify(codexAgentOutputSchema, null, 2));

  const args = [
    'exec',
    '--cd',
    input.projectRoot,
    '--skip-git-repo-check',
    '--sandbox',
    input.config.codexSandboxMode,
    '--color',
    'never',
    '--output-schema',
    schemaPath,
    '--output-last-message',
    outputPath,
    '-',
  ];

  if (input.config.codexModel) {
    args.splice(1, 0, '--model', input.config.codexModel);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.config.codexBin, args, {
      cwd: input.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdout.on('data', () => {
      // Drain progress output so long-running Codex runs cannot block on a full pipe buffer.
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Codex exited with code ${code ?? 'unknown'}`));
    });

    child.stdin.end(input.prompt);
  });

  try {
    return JSON.parse(readFileSync(outputPath, 'utf8')) as CodexAgentResult;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
