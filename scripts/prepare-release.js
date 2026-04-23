#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const versionFile = path.join(repoRoot, 'VERSION');
const buildProjects = ['orchestrator', 'socket-server', 'dashboard', 'worker-host'];

function readVersion() {
  return readFileSync(versionFile, 'utf8').trim();
}

function bumpPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`VERSION must use x.y.z semver format. Received: ${version}`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function writeVersion(version) {
  writeFileSync(versionFile, `${version}\n`);
}

function runBuilds() {
  execFileSync('node', ['scripts/build-shared-packages.js'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  execFileSync(
    'npx',
    ['nx', 'run-many', '-t', 'build', '--projects', buildProjects.join(',')],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );
}

function main() {
  const currentVersion = readVersion();
  const nextVersion = bumpPatchVersion(currentVersion);

  writeVersion(nextVersion);
  console.log(`Bumped VERSION from ${currentVersion} to ${nextVersion}`);
  console.log(`Building release artifacts for: ${buildProjects.join(', ')}`);

  try {
    runBuilds();
  } catch (error) {
    writeVersion(currentVersion);
    throw error;
  }
}

main();
