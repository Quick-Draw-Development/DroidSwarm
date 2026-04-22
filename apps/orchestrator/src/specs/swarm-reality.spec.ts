import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CodexAgentResult, MessageEnvelope, OrchestratorConfig, RunRecord } from '../types';
import { openPersistenceDatabase } from '../persistence/database';
import { PersistenceClient } from '../persistence/repositories';
import { OrchestratorPersistenceService } from '../persistence/service';
import { TaskScheduler } from '../scheduler/TaskScheduler';
import { OrchestratorEngine } from '../engine/OrchestratorEngine';
import { WorkerRegistry } from '../worker-registry';
import { OperatorActionService } from '../operator/OperatorActionService';
import { SocketGateway } from '../socket/SocketGateway';
import { AgentSupervisor } from '../AgentSupervisor';
import { OperatorChatResponder } from '../operator/OperatorChatResponder';
import { RunLifecycleService } from '../run-lifecycle';
import { ToolService } from '../tools/ToolService';

const DEFAULT_CONFIG: OrchestratorConfig = {
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
  heartbeatMs: 1000,
  reconnectMs: 1000,
  codexBin: 'codex',
  codexCloudModel: 'gpt-5-codex',
  codexApiBaseUrl: 'https://api.openai.com/v1',
  codexApiKey: 'test-key',
  codexSandboxMode: 'workspace-write',
  llamaBaseUrl: 'http://127.0.0.1:11434',
  llamaModel: 'llama',
  llamaTimeoutMs: 1000,
  muxBaseUrl: 'http://127.0.0.1:8960',
  muxToken: 'mux-token',
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
  maxAgentsPerTask: 8,
  maxConcurrentAgents: 8,
  maxConcurrentCodeAgents: 4,
  specDir: '',
  orchestratorRules: '',
  droidspeakRules: '',
  agentRules: '',
  plannerRules: '',
  codingRules: '',
  dbPath: '',
  schedulerMaxTaskDepth: 6,
  schedulerMaxFanOut: 5,
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
};

class StubSupervisor {
  public readonly assigned: Array<{
    agentName: string;
    taskId: string;
    role: string;
    attemptId: string;
    options?: Record<string, unknown>;
  }> = [];

  startAgentForTask(
    task: { taskId: string },
    role: string,
    attemptId: string,
    _parentSummary?: string,
    _parentDroidspeak?: string,
    _model?: string,
    options?: Record<string, unknown>,
  ): { agentName: string; taskId: string; role: string; attemptId: string; options?: Record<string, unknown> } {
    const spawned = {
      agentName: `${task.taskId}-${role}-${attemptId.slice(0, 6)}`,
      taskId: task.taskId,
      role,
      attemptId,
      options,
    };
    this.assigned.push(spawned);
    return spawned;
  }

  setCallbacks(): void {
    return;
  }

  getActiveAgentCount(): number {
    return 0;
  }

  countActiveAgents(_predicate?: (agent: { role: string; taskId: string }) => boolean): number {
    return 0;
  }
}

class StubGateway {
  public readonly channels = new Set<string>();

  send(_message: MessageEnvelope): void {
    return;
  }

  watchTaskChannel(taskId: string): void {
    this.channels.add(taskId);
  }
}

class StubChatResponder extends OperatorChatResponder {
  constructor(config: OrchestratorConfig) {
    super(config);
  }

  async respond(content: string): Promise<string> {
    return `ack: ${content}`;
  }
}

type Environment = {
  engine: OrchestratorEngine;
  scheduler: TaskScheduler;
  service: OrchestratorPersistenceService;
  supervisor: StubSupervisor;
  gateway: StubGateway;
  persistence: ReturnType<typeof PersistenceClient.fromDatabase>;
  runLifecycle: RunLifecycleService;
  run: RunRecord;
  dbPath: string;
  close: () => void;
  destroy: () => void;
};

const buildConfig = (dbPath: string, overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
  ...DEFAULT_CONFIG,
  dbPath,
  ...overrides,
});

const createEnvironment = (options?: { dbPath?: string; run?: RunRecord; configOverrides?: Partial<OrchestratorConfig> }): Environment => {
  const workspace = options?.dbPath ? path.dirname(options.dbPath) : mkdtempSync(path.join(tmpdir(), 'droidswarm-swarm-reality-'));
  const dbPath = options?.dbPath ?? path.join(workspace, 'state.db');
  const database = openPersistenceDatabase(dbPath);
  const persistence = PersistenceClient.fromDatabase(database);
  const run = options?.run ?? persistence.createRun(DEFAULT_CONFIG.projectId);
  const runLifecycle = new RunLifecycleService(persistence);
  runLifecycle.startRun(run);
  const service = new OrchestratorPersistenceService(persistence, run);
  const supervisor = new StubSupervisor();
  const gateway = new StubGateway();
  const config = buildConfig(dbPath, options?.configOverrides);
  const scheduler = new TaskScheduler(service, supervisor as unknown as AgentSupervisor, config);
  const chatResponder = new StubChatResponder(config);
  const controlService = new OperatorActionService(service, supervisor as unknown as AgentSupervisor);
  const registry = new WorkerRegistry();
  const toolService = new ToolService(config, service);
  const engine = new OrchestratorEngine({
    config,
    persistenceService: service,
    scheduler,
    supervisor: supervisor as unknown as AgentSupervisor,
    gateway: gateway as unknown as SocketGateway,
    chatResponder,
    controlService,
    registry,
    runLifecycle: new RunLifecycleService(persistence),
    toolService,
  });
  scheduler.setEvents({
    onPlanProposed: engine.onPlanProposed,
    onCheckpointCreated: engine.onCheckpointCreated,
    onVerificationRequested: engine.onVerificationRequested,
    onVerificationOutcome: engine.onVerificationOutcome,
  });

  return {
    engine,
    scheduler,
    service,
    supervisor,
    gateway,
    persistence,
    runLifecycle,
    run,
    dbPath,
    close: () => database.close(),
    destroy: () => {
      database.close();
      if (!options?.dbPath) {
        rmSync(workspace, { recursive: true, force: true });
      }
    },
  };
};

const buildTaskCreatedMessage = (taskId: string): MessageEnvelope => ({
  message_id: `task-${taskId}`,
  project_id: DEFAULT_CONFIG.projectId,
  room_id: 'operator',
  task_id: taskId,
  type: 'task_created',
  from: {
    actor_type: 'human',
    actor_id: 'operator-1',
    actor_name: 'operator',
  },
  timestamp: new Date().toISOString(),
  payload: {
    task_id: taskId,
    title: 'Swarm reality task',
    description: 'Drive multi-helper orchestration',
    task_type: 'feature',
    priority: 'high',
    created_by: 'operator',
  },
});

const simpleResult = (summary: string): CodexAgentResult => ({
  status: 'completed',
  summary,
  requested_agents: [],
  artifacts: [],
  doc_updates: [],
  branch_actions: [],
});

describe('swarm reality smoke', () => {
  it('fans out helpers, records shorthand, triggers verification, and resumes with digest-first context', async () => {
    const env1 = createEnvironment();
    await env1.engine.handleMessage(buildTaskCreatedMessage('swarm-reality-root'), 'operator');

    const rootSpawn = env1.supervisor.assigned[0];
    assert.ok(rootSpawn);

    env1.scheduler.handleAgentResult(
      rootSpawn.taskId,
      rootSpawn.attemptId,
      rootSpawn.agentName,
      rootSpawn.role,
      {
        status: 'completed',
        summary: 'Split into specialist helpers.',
        requested_agents: [
          { role: 'researcher', reason: 'answer open questions', instructions: 'Research the current APIs.' },
          { role: 'repo-scanner', reason: 'scan repo', instructions: 'Map relevant code paths.' },
          { role: 'implementation-helper', reason: 'prepare code changes', instructions: 'Plan the implementation slice.' },
          { role: 'summarizer', reason: 'compress context', instructions: 'Summarize the current state.' },
        ],
        artifacts: [],
        doc_updates: [],
        branch_actions: [],
      },
    );

    const helperSpawns = env1.supervisor.assigned.slice(1);
    assert.equal(helperSpawns.length, 4);
    assert.ok(helperSpawns.every((spawn) => (spawn.options?.taskDigest as { id?: string } | undefined)?.id));
    assert.ok(helperSpawns.every((spawn) => (spawn.options?.handoffPacket as { id?: string } | undefined)?.id));
    assert.ok(helperSpawns.every((spawn) => Array.isArray(spawn.options?.requiredReads)));

    const blockedHelper = helperSpawns[0];
    env1.service.setTaskStatus(blockedHelper.taskId, 'waiting_on_human');
    env1.service.recordTaskStateDigest({
      id: `digest-${blockedHelper.taskId}`,
      taskId: blockedHelper.taskId,
      runId: env1.run.runId,
      projectId: DEFAULT_CONFIG.projectId,
      objective: 'Await schema decision.',
      currentPlan: ['Pause helper until schema choice is made'],
      decisions: [],
      openQuestions: ['Which schema version should we target?'],
      activeRisks: ['Schema mismatch'],
      artifactIndex: [],
      verificationState: 'waiting_on_human',
      lastUpdatedBy: blockedHelper.agentName,
      ts: new Date().toISOString(),
      droidspeak: {
        compact: 'blocked:waiting',
        expanded: 'Blocked while waiting for a schema decision.',
        kind: 'blocked',
      },
    });
    assert.equal(env1.service.getLatestTaskStateDigest(blockedHelper.taskId)?.droidspeak?.compact, 'blocked:waiting');

    const verificationCandidate = helperSpawns[1];
    env1.scheduler.handleAgentResult(
      verificationCandidate.taskId,
      verificationCandidate.attemptId,
      verificationCandidate.agentName,
      verificationCandidate.role,
      simpleResult('Repo scan complete.'),
    );

    const verificationSpawn = env1.supervisor.assigned.find((spawn) => spawn.role === 'tester' && spawn.taskId !== rootSpawn.taskId);
    assert.ok(verificationSpawn, 'expected verification helper');

    env1.close();

    const env2 = createEnvironment({ dbPath: env1.dbPath, run: env1.run });
    const summaries = env2.runLifecycle.recoverInterruptedRuns();
    assert.equal(summaries.length, 1);
    assert.ok(summaries[0].resumedTasks.length >= 2);
    assert.ok(summaries[0].resumedTasks.includes(blockedHelper.taskId));

    for (const taskId of summaries[0].resumedTasks) {
      env2.scheduler.handleNewTask(taskId);
    }

    const resumedBlocked = env2.supervisor.assigned.find((spawn) => spawn.taskId === blockedHelper.taskId);
    const recoveredBlockedTask = env2.service.getTask(blockedHelper.taskId);
    assert.ok(recoveredBlockedTask);
    assert.equal(recoveredBlockedTask?.metadata?.recovery_digest_id, `digest-${blockedHelper.taskId}`);
    assert.equal(typeof recoveredBlockedTask?.metadata?.recovery_handoff_id, 'string');
    if (resumedBlocked) {
      assert.equal((resumedBlocked.options?.taskDigest as { taskId?: string } | undefined)?.taskId, blockedHelper.taskId);
      assert.equal(typeof (resumedBlocked.options?.handoffPacket as { id?: string } | undefined)?.id, 'string');
      assert.ok(Array.isArray(resumedBlocked.options?.requiredReads));
    }

    env2.destroy();
  });
});
