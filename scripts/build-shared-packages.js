#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

execFileSync('npx', ['tsc', '-p', 'tsconfig.shared-packages.json'], {
  cwd: repoRoot,
  stdio: 'inherit',
});
