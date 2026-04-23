import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseIncomingEnvelope } from '../../socket-server/src/protocol/validate';
import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { OrchestratorPersistenceService } from './persistence/service';
import { TaskScheduler } from './scheduler/TaskScheduler';
import { RunLifecycleService } from './run-lifecycle';
import type { AgentSupervisor } from './AgentSupervisor';
import type { CodexAgentResult, OrchestratorConfig, TaskRecord } from './types';
import { buildDroidspeakV2 } from './coordination';

const createTestConfig = (overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
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
  maxAgentsPerTask: 6,
  maxConcurrentAgents: 6,
  maxConcurrentCodeAgents: 3,
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
  ...overrides,
});

describe('architecture conformance', () => {
  it('normalizes legacy payloads and preserves native EnvelopeV2 payloads', () => {
    const legacy = parseIncomingEnvelope(JSON.stringify({
      message_id: 'legacy-1',
      project_id: 'droidswarm',
      room_id: 'task-1',
      type: 'spawn_approved',
      timestamp: '2026-03-12T12:00:00.000Z',
      from: {
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-1',
        actor_name: 'orchestrator',
      },
      payload: {
        task_id: 'task-1',
        approved_agents: [],
        summary: 'legacy spawn approval',
      },
    }));

    assert.equal(legacy.canonical.id, 'legacy-1');
    assert.equal(legacy.canonical.verb, 'spawn.approved');
    assert.deepEqual(legacy.canonical.body, {
      task_id: 'task-1',
      approved_agents: [],
      summary: 'legacy spawn approval',
    });
    assert.equal(legacy.message.type, 'spawn_approved');

    const native = parseIncomingEnvelope(JSON.stringify({
      id: 'env-1',
      ts: '2026-03-12T12:05:00.000Z',
      project_id: 'droidswarm',
      swarm_id: 'swarm-1',
      run_id: 'run-1',
      task_id: 'task-1',
      room_id: 'task-1',
      agent_id: 'planner-1',
      role: 'planner',
      verb: 'plan.proposed',
      depends_on: ['checkpoint-1'],
      artifact_refs: ['artifact-1'],
      memory_refs: ['digest-1'],
      risk: {
        level: 'low',
      },
      body: {
        summary: 'native envelope',
      },
    }));

    assert.equal(native.canonical.id, 'env-1');
    assert.equal(native.canonical.verb, 'plan.proposed');
    assert.equal(native.canonical.run_id, 'run-1');
    assert.deepEqual(native.canonical.body, { summary: 'native envelope' });
    assert.equal(native.message.verb, 'plan.proposed');
  });

  it('boots workers with latest digest, handoff, required reads, model tier, and routing telemetry', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-architecture-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const spawnLog: Array<{
      taskId: string;
      role: string;
      attemptId: string;
      agentName: string;
      options?: Record<string, unknown>;
    }> = [];
    const supervisorStub = {
      startAgentForTask(task: TaskRecord, role: string, attemptId: string, _parentSummary?: string, _parentDroidspeak?: string, _model?: string, options?: Record<string, unknown>) {
        const spawned = { taskId: task.taskId, role, attemptId, agentName: `agent-${attemptId}`, options };
        spawnLog.push(spawned);
        return spawned;
      },
      setCallbacks() {
        return;
      },
      getActiveAgentCount() {
        return 0;
      },
      countActiveAgents(_predicate?: (agent: unknown) => boolean) {
        return 0;
      },
    } as unknown as AgentSupervisor;

    const scheduler = new TaskScheduler(service, supervisorStub, createTestConfig({ dbPath }));
    const rootTask = service.createTask({
      taskId: 'root-task',
      name: 'Root task',
      priority: 'high',
      metadata: {
        description: 'Drive the feature',
        task_type: 'plan',
      },
    });

    scheduler.handleNewTask(rootTask.taskId);
    const plannerAttempt = spawnLog[0];
    assert.ok(plannerAttempt);

    const planResult: CodexAgentResult = {
      status: 'completed',
      summary: 'Spawn helpers',
      requested_agents: [{
        role: 'implementation-helper',
        reason: 'Implement the first slice',
        instructions: 'Implement the feature slice.',
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };

    scheduler.handleAgentResult(
      rootTask.taskId,
      plannerAttempt.attemptId,
      plannerAttempt.agentName,
      plannerAttempt.role,
      planResult,
    );

    const childAttempt = spawnLog[1];
    assert.ok(childAttempt);
    assert.equal((childAttempt.options?.taskDigest as { taskId?: string } | undefined)?.taskId, rootTask.taskId);
    assert.equal(typeof (childAttempt.options?.handoffPacket as { id?: string } | undefined)?.id, 'string');
    assert.ok(Array.isArray(childAttempt.options?.requiredReads));
    assert.equal(childAttempt.options?.modelTier, 'local-capable');
    assert.equal((childAttempt.options?.routingTelemetry as { modelTier?: string } | undefined)?.modelTier, 'local-capable');
    assert.equal(typeof (childAttempt.options?.routingTelemetry as { queueDepth?: number } | undefined)?.queueDepth, 'number');
    assert.equal(
      ((childAttempt.options?.compactVerbDictionary as Record<string, string> | undefined) ?? {})['handoff.ready'],
      'A helper handoff is ready.',
    );

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('reuses persisted digests and handoffs when interrupted runs resume before new fanout', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-architecture-'));
    const dbPath = path.join(workspace, 'state.db');
    const database1 = openPersistenceDatabase(dbPath);
    const persistence1 = PersistenceClient.fromDatabase(database1);
    const run = persistence1.createRun('droidswarm');
    const service1 = new OrchestratorPersistenceService(persistence1, run);

    const spawnLog1: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub1 = {
      startAgentForTask(task: TaskRecord, role: string, attemptId: string) {
        const spawned = { taskId: task.taskId, role, attemptId, agentName: `agent-${attemptId}` };
        spawnLog1.push(spawned);
        return spawned;
      },
      setCallbacks() {
        return;
      },
      getActiveAgentCount() {
        return 0;
      },
      countActiveAgents(_predicate?: (agent: unknown) => boolean) {
        return 0;
      },
    } as unknown as AgentSupervisor;

    const scheduler1 = new TaskScheduler(service1, supervisorStub1, createTestConfig({ dbPath }));
    const rootTask = service1.createTask({
      taskId: 'resume-root',
      name: 'Resume root',
      priority: 'medium',
      metadata: {
        description: 'Resume root task',
        task_type: 'plan',
      },
    });

    scheduler1.handleNewTask(rootTask.taskId);
    const rootAttempt = spawnLog1[0];
    scheduler1.handleAgentResult(
      rootTask.taskId,
      rootAttempt.attemptId,
      rootAttempt.agentName,
      rootAttempt.role,
      {
        status: 'completed',
        summary: 'Need one helper',
        requested_agents: [{
          role: 'repo-scanner',
          reason: 'Scan the repo',
          instructions: 'Find the relevant code.',
        }],
        artifacts: [],
        doc_updates: [],
        branch_actions: [],
      },
    );

    const childTask = service1.getTasks().find((task) => task.parentTaskId === rootTask.taskId);
    assert.ok(childTask);
    service1.recordTaskStateDigest({
      id: 'digest-resume',
      taskId: childTask.taskId,
      runId: run.runId,
      projectId: 'droidswarm',
      objective: 'Resume helper',
      currentPlan: ['resume helper'],
      decisions: ['reuse digest'],
      openQuestions: [],
      activeRisks: [],
      artifactIndex: [{
        artifactId: 'artifact-resume',
        kind: 'summary',
        summary: 'Resume artifact',
      }],
      verificationState: 'running',
      lastUpdatedBy: rootAttempt.agentName,
      ts: new Date().toISOString(),
      droidspeak: buildDroidspeakV2('memory_pinned', 'Resume digest pinned.'),
    });
    service1.recordHandoffPacket({
      id: 'handoff-resume',
      taskId: childTask.taskId,
      runId: run.runId,
      projectId: 'droidswarm',
      fromTaskId: rootTask.taskId,
      toTaskId: childTask.taskId,
      toRole: 'repo-scanner',
      digestId: 'digest-resume',
      requiredReads: ['artifact-resume'],
      summary: 'Resume helper with compact context.',
      ts: new Date().toISOString(),
      droidspeak: buildDroidspeakV2('handoff_ready', 'Resume handoff ready.'),
    });

    database1.close();

    const database2 = openPersistenceDatabase(dbPath);
    const persistence2 = PersistenceClient.fromDatabase(database2);
    const lifecycle = new RunLifecycleService(persistence2);
    const summaries = lifecycle.recoverInterruptedRuns();
    assert.equal(summaries.length, 1);
    assert.ok(summaries[0].resumedTasks.includes(childTask.taskId));

    const service2 = new OrchestratorPersistenceService(persistence2, run);
    const spawnLog2: Array<{
      taskId: string;
      role: string;
      attemptId: string;
      agentName: string;
      options?: Record<string, unknown>;
    }> = [];
    const supervisorStub2 = {
      startAgentForTask(task: TaskRecord, role: string, attemptId: string, _parentSummary?: string, _parentDroidspeak?: string, _model?: string, options?: Record<string, unknown>) {
        const spawned = { taskId: task.taskId, role, attemptId, agentName: `agent-${attemptId}`, options };
        spawnLog2.push(spawned);
        return spawned;
      },
      setCallbacks() {
        return;
      },
      getActiveAgentCount() {
        return 0;
      },
      countActiveAgents(_predicate?: (agent: unknown) => boolean) {
        return 0;
      },
    } as unknown as AgentSupervisor;
    const scheduler2 = new TaskScheduler(service2, supervisorStub2, createTestConfig({ dbPath }));

    scheduler2.handleNewTask(childTask.taskId);

    const resumedAttempt = spawnLog2[0];
    assert.ok(resumedAttempt);
    assert.equal((resumedAttempt.options?.taskDigest as { id?: string } | undefined)?.id, 'digest-resume');
    assert.equal((resumedAttempt.options?.handoffPacket as { id?: string } | undefined)?.id, 'handoff-resume');
    assert.deepEqual(resumedAttempt.options?.requiredReads, ['artifact-resume']);

    database2.close();
    rmSync(workspace, { recursive: true, force: true });
  });
});
