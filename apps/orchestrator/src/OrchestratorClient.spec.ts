import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { DroidSwarmOrchestratorClient } from './OrchestratorClient';
import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import type { OrchestratorConfig } from './types';
import { SocketGateway } from './socket/SocketGateway';
import { TaskScheduler } from './scheduler/TaskScheduler';

const TEST_CONFIG = (dbPath: string): OrchestratorConfig => ({
  environment: 'test',
  projectId: 'droidswarm',
  projectName: 'DroidSwarm',
  projectRoot: '/',
  repoId: 'droidswarm-repo',
  defaultBranch: 'main',
  developBranch: 'develop',
  allowedRepoRoots: ['/'],
  workspaceRoot: '/tmp/droidswarm-workspaces',
  agentName: 'Orchestrator',
  agentRole: 'control-plane',
  socketUrl: 'ws://localhost:8765',
  heartbeatMs: 100,
  reconnectMs: 100,
  codexBin: 'codex',
  codexCloudModel: 'gpt-5-codex',
  codexApiBaseUrl: 'https://api.openai.com/v1',
  codexApiKey: 'test-key',
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
  maxAgentsPerTask: 4,
  maxConcurrentAgents: 4,
  maxConcurrentCodeAgents: 2,
  specDir: '',
  orchestratorRules: '',
  droidspeakRules: '',
  agentRules: '',
  plannerRules: '',
  codingRules: '',
  dbPath,
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
    plannerRoles: ['plan', 'planner', 'research', 'review', 'orchestrator', 'checkpoint', 'compress'],
    appleRoles: ['apple', 'ios', 'macos', 'swift', 'swiftui', 'xcode', 'visionos'],
    appleTaskHints: ['apple', 'ios', 'ipad', 'iphone', 'macos', 'osx', 'swift', 'swiftui', 'objective-c', 'uikit', 'appkit', 'xcode', 'testflight', 'visionos', 'watchos', 'tvos'],
    codeHints: ['code', 'coder', 'dev', 'implementation', 'debug', 'refactor'],
    cloudEscalationHints: ['refactor', 'debug', 'multi-file', 'migration', 'large-scale'],
  },
  budgetMaxConsumed: undefined,
});

const originals = {
  gatewayStart: SocketGateway.prototype.start,
  gatewayStop: SocketGateway.prototype.stop,
  gatewayWatchTaskChannel: SocketGateway.prototype.watchTaskChannel,
  schedulerHandleNewTask: TaskScheduler.prototype.handleNewTask,
};

afterEach(() => {
  SocketGateway.prototype.start = originals.gatewayStart;
  SocketGateway.prototype.stop = originals.gatewayStop;
  SocketGateway.prototype.watchTaskChannel = originals.gatewayWatchTaskChannel;
  TaskScheduler.prototype.handleNewTask = originals.schedulerHandleNewTask;
});

describe('DroidSwarmOrchestratorClient recovery boot', () => {
  it('watches recovered task channels before requeueing resumed work', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-client-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm');

    persistence.tasks.create({
      taskId: 'task-1',
      runId: run.runId,
      name: 'Recovered task',
      priority: 'medium',
      status: 'running',
      metadata: {
        description: 'Recovered task description',
        task_type: 'task',
        created_by: 'tester',
        branch_name: 'main',
      },
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    database.close();

    const orderedCalls: string[] = [];
    SocketGateway.prototype.start = function startStub(): void {
      orderedCalls.push('gateway.start');
    };
    SocketGateway.prototype.stop = function stopStub(): void {
      orderedCalls.push('gateway.stop');
    };
    SocketGateway.prototype.watchTaskChannel = function watchTaskChannelStub(taskId: string): void {
      orderedCalls.push(`watch:${taskId}`);
    };
    TaskScheduler.prototype.handleNewTask = function handleNewTaskStub(taskId: string): void {
      orderedCalls.push(`schedule:${taskId}`);
    };

    const client = new DroidSwarmOrchestratorClient(TEST_CONFIG(dbPath));
    try {
      client.start();
      const watchIndex = orderedCalls.indexOf('watch:task-1');
      const scheduleIndex = orderedCalls.indexOf('schedule:task-1');
      assert.ok(watchIndex >= 0, 'expected recovered task channel to be watched');
      assert.ok(scheduleIndex >= 0, 'expected recovered task to be requeued');
      assert.ok(watchIndex < scheduleIndex, 'expected task channel watch before requeue');
    } finally {
      client.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
