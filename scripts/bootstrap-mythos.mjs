#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pythonBin = process.env.DROIDSWARM_MYTHOS_PYTHON_BIN || 'python3';

const pipProbe = spawnSync(pythonBin, ['-m', 'pip', 'show', 'open-mythos'], {
  encoding: 'utf8',
  env: process.env,
});

const installed = pipProbe.status === 0;
const installAttempt = installed
  ? { attempted: false, ok: true }
  : spawnSync(pythonBin, ['-m', 'pip', 'install', 'open-mythos'], {
    encoding: 'utf8',
    env: process.env,
  });

const bootstrap = spawnSync('node', ['--import', 'tsx', path.resolve(root, 'packages/mythos-engine/src/cli.ts'), 'bootstrap'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    DROIDSWARM_ENABLE_MYTHOS: process.env.DROIDSWARM_ENABLE_MYTHOS ?? 'true',
  },
});

const payload = {
  pythonBin,
  installedBefore: installed,
  installSucceeded: installed ? true : installAttempt.status === 0,
  installStdout: installed ? pipProbe.stdout : installAttempt.stdout,
  installStderr: installed ? pipProbe.stderr : installAttempt.stderr,
  bootstrapStatus: bootstrap.status,
  bootstrapStdout: bootstrap.stdout,
  bootstrapStderr: bootstrap.stderr,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
