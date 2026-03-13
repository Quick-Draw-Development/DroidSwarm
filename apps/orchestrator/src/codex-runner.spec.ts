import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runCodexPrompt } from './codex-runner';
import type { OrchestratorConfig } from './types';

const createFakeCodex = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'droidswarm-fake-codex-'));
  const scriptPath = path.join(dir, 'codex');

  writeFileSync(scriptPath, `#!/usr/bin/env bash
set -euo pipefail
output_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      shift
      output_file="$1"
      ;;
  esac
  shift || true
done
cat >/dev/null
cat >"$output_file" <<'EOF'
{"status":"completed","summary":"planned work","requested_agents":[],"artifacts":[{"kind":"plan","title":"Plan","content":"Do the work"}],"doc_updates":[],"branch_actions":[]}
EOF
`);
  chmodSync(scriptPath, 0o755);
  return dir;
};

describe('runCodexPrompt', () => {
  it('executes a codex-like binary and parses the structured result', async () => {
    const fakeCodexDir = createFakeCodex();
    const fakeCodexPath = path.join(fakeCodexDir, 'codex');

    const config: OrchestratorConfig = {
      environment: 'test',
      projectId: 'proj-1',
      projectName: 'Project 1',
      projectRoot: process.cwd(),
      agentName: 'Orchestrator',
      agentRole: 'control-plane',
      socketUrl: 'ws://localhost:8765',
      heartbeatMs: 10_000,
      reconnectMs: 1_000,
      codexBin: fakeCodexPath,
      codexSandboxMode: 'workspace-write',
      maxAgentsPerTask: 4,
      maxConcurrentAgents: 8,
      specDir: process.cwd(),
      orchestratorRules: '',
      droidspeakRules: '',
      agentRules: '',
    };

    try {
      const result = await runCodexPrompt({
        config,
        prompt: 'plan the work',
        projectRoot: process.cwd(),
      });

      assert.equal(result.status, 'completed');
      assert.equal(result.summary, 'planned work');
      assert.equal(result.artifacts[0]?.kind, 'plan');
    } finally {
      rmSync(fakeCodexDir, { recursive: true, force: true });
    }
  });
});
