import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSupervisor } from './AgentSupervisor';
import { WorkerRegistry } from './worker-registry';
import type { OrchestratorConfig } from './types';

const TEST_CONFIG: OrchestratorConfig = {
  environment: 'test',
  projectId: 'droidswarm',
  projectName: 'DroidSwarm',
  projectRoot: '/',
  repoId: 'droidswarm-repo',
  defaultBranch: 'main',
  developBranch: 'develop',
  allowedRepoRoots: ['/'],
  workspaceRoot: '/tmp/droidswarm-workspaces',
  workerHostEntry: '/tmp/worker-host.js',
  agentName: 'Orchestrator',
  agentRole: 'control-plane',
  socketUrl: 'ws://localhost:8765',
  heartbeatMs: 100,
  reconnectMs: 100,
  codexBin: 'codex',
  codexSandboxMode: 'workspace-write',
  llamaBaseUrl: 'http://127.0.0.1:11434',
  llamaModel: 'llama',
  llamaTimeoutMs: 1000,
  prAutomationEnabled: false,
  prRemoteName: 'origin',
  gitPolicy: {
    mainBranch: 'main',
    developBranch: 'develop',
    prefixes: {
      feature: 'feature/',
      hotfix: 'hotfix/',
      release: 'release/',
      support: 'support/',
    },
  },
  maxAgentsPerTask: 3,
  maxConcurrentAgents: 8,
  maxConcurrentCodeAgents: 3,
  specDir: '',
  orchestratorRules: '',
  droidspeakRules: '',
  agentRules: '',
  plannerRules: '',
  codingRules: '',
  dbPath: ':memory:',
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 250,
  sideEffectActionsBeforeReview: 0,
  allowedTools: [],
  modelRouting: {
    planning: 'o1-preview',
    verification: 'gpt-4o-mini',
    code: 'claude-3.5-sonnet',
    apple: 'apple-intelligence/local',
    default: 'o1-preview',
  },
  routingPolicy: {
    plannerRoles: ['plan', 'planner'],
    appleRoles: ['apple'],
    appleTaskHints: ['apple'],
    codeHints: ['code'],
    cloudEscalationHints: ['migration'],
  },
  federationEnabled: true,
  federationRemoteWorkers: [
    {
      targetId: 'adb-emulator-1',
      serial: 'emulator-5554',
      remoteEntry: '/sdcard/Android/data/com.droidswarm/files/federation/runtime/orchestrator/main.js',
      remoteCommand: 'node',
      roles: ['planner'],
      engines: ['codex-cli'],
      nodeId: 'android-node-1',
    },
  ],
};

describe('AgentSupervisor federation target selection', () => {
  it('selects eligible federated adb workers for matching role and engine', () => {
    const supervisor = new AgentSupervisor(TEST_CONFIG, new WorkerRegistry(), '/tmp/worker-host.js');
    const selected = (supervisor as any).selectExecutionTarget('planner', 'codex-cli', undefined);

    assert.equal(selected?.targetId, 'adb-emulator-1');
    assert.equal(selected?.serial, 'emulator-5554');
    assert.equal(selected?.nodeId, 'android-node-1');
  });

  it('keeps work local when no federated target matches', () => {
    const supervisor = new AgentSupervisor(TEST_CONFIG, new WorkerRegistry(), '/tmp/worker-host.js');
    const selected = (supervisor as any).selectExecutionTarget('reviewer', 'local-llama', undefined);

    assert.equal(selected, undefined);
  });
});
