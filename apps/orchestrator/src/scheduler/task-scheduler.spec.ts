import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CodexAgentResult, OrchestratorConfig, TaskPolicy } from '../types';
import type { AgentSupervisor } from '../AgentSupervisor';
import { openPersistenceDatabase } from '../persistence/database';
import { PersistenceClient } from '../persistence/repositories';
import { OrchestratorPersistenceService } from '../persistence/service';
import { TaskScheduler } from './TaskScheduler';

const nowIso = (): string => new Date().toISOString();

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
  maxAgentsPerTask: 4,
  maxConcurrentAgents: 4,
  specDir: '',
  orchestratorRules: '',
  droidspeakRules: '',
  agentRules: '',
  plannerRules: '',
  codingRules: '',
  dbPath: '',
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 1000,
  maxConcurrentCodeAgents: 2,
  sideEffectActionsBeforeReview: 1,
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

describe('TaskScheduler', () => {
  it('schedules tasks, respects dependencies, and reopens parents when children finish', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{
      taskId: string;
      role: string;
      attemptId: string;
      agentName: string;
      model?: string;
      options?: Record<string, unknown>;
    }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, model?: string, options?: Record<string, unknown>) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}`, model, options });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
      },
      setCallbacks() {
        // no-op
      },
      getActiveAgentCount() {
        return 0;
      },
      countActiveAgents(_predicate?: (agent: unknown) => boolean) {
        return 0;
      },
    } as unknown as AgentSupervisor;

    const config = createTestConfig();
    const scheduler = new TaskScheduler(service, supervisorStub, config);
    const rootTask = service.createTask({
      taskId: 'root',
      name: 'Root Plan',
      priority: 'medium',
      metadata: {
        description: 'Top-level plan',
        task_type: 'plan',
      },
    });
    scheduler.handleNewTask(rootTask.taskId);

    assert.equal(spawnLog.length, 1);
    assert.equal(service.getTask(rootTask.taskId)?.status, 'running');

    const planResult: CodexAgentResult = {
      status: 'completed',
      summary: 'ready for work',
      requested_agents: [{
        role: 'coder',
        reason: 'implementation',
        instructions: 'Implement the feature.',
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);

    const tasksAfterPlan = service.getTasks();
    const childTask = tasksAfterPlan.find((task) => task.parentTaskId === rootTask.taskId);
    assert.ok(childTask);
    assert.equal(tasksAfterPlan.length, 2);
    assert.equal(service.getTask(rootTask.taskId)?.status, 'waiting_on_dependency');
    const dependencies = persistence.dependencies.listDependencies(rootTask.taskId);
    assert.equal(dependencies.length, 1);
    assert.equal(dependencies[0].dependsOnTaskId, childTask.taskId);
    const digest = service.getLatestTaskStateDigest(rootTask.taskId);
    assert.ok(digest);
    const handoffs = service.listHandoffPackets(childTask.taskId);
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].toRole, 'coder');
    assert.equal(spawnLog.length, 2, 'child task should have been scheduled');
    assert.equal((spawnLog[0].options?.modelTier as string | undefined), 'local-cheap');
    assert.equal((spawnLog[0].options?.routingTelemetry as { routeKind?: string } | undefined)?.routeKind, 'planner-local');
    assert.equal((spawnLog[1].options?.handoffPacket as { id?: string } | undefined)?.id, handoffs[0].id);
    assert.equal((spawnLog[1].options?.requiredReads as string[] | undefined)?.[0], handoffs[0].requiredReads[0]);
    assert.equal(
      ((spawnLog[1].options?.compactVerbDictionary as Record<string, string> | undefined) ?? {})['handoff.ready'],
      'A helper handoff is ready.',
    );

    const childAttempt = spawnLog[1];
    const childResult: CodexAgentResult = {
      status: 'completed',
      summary: 'done',
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };
    scheduler.handleAgentResult(childTask.taskId, childAttempt.attemptId, childAttempt.agentName, childAttempt.role, childResult);

    assert.equal(service.getTask(childTask.taskId)?.status, 'in_review');
    assert.equal(service.getTask(rootTask.taskId)?.status, 'waiting_on_dependency');

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('fails parent tasks when required dependencies fail', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, model?: string) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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

    const config = createTestConfig();
    const scheduler = new TaskScheduler(service, supervisorStub, config);
    const rootTask = service.createTask({
      taskId: 'root',
      name: 'Root Plan',
      priority: 'medium',
      metadata: {
        description: 'Root plan',
      },
    });
    scheduler.handleNewTask(rootTask.taskId);

    const planResult: CodexAgentResult = {
      status: 'completed',
      summary: 'need help',
      requested_agents: [{
        role: 'coder',
        reason: 'implement feature',
        instructions: 'Do work.',
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);

    const childTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId);
    assert.ok(childTask);

    const childAttempt = spawnLog[1];
    const childResult: CodexAgentResult = {
      status: 'completed',
      summary: 'could not proceed',
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };
    scheduler.handleAgentResult(childTask!.taskId, childAttempt.attemptId, childAttempt.agentName, childAttempt.role, childResult);
    service.setTaskStatus(childTask!.taskId, 'failed');
    scheduler.handleNewTask(rootTask.taskId);

    assert.equal(service.getTask(rootTask.taskId)?.status, 'failed');
    assert.equal(service.getTask(rootTask.taskId)?.metadata?.blocked_reason, `Dependency ${childTask!.taskId} failed`);

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('enforces token policies before letting work continue', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, model?: string) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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

    const config = createTestConfig();
    const scheduler = new TaskScheduler(service, supervisorStub, config);
    const policyTask = service.createTask({
      taskId: 'policy-root',
      name: 'Policy Task',
      priority: 'medium',
      metadata: {
        description: 'Respect token guards',
        task_type: 'plan',
        policy: {
          max_tokens: 100,
        },
      },
    });
    scheduler.handleNewTask(policyTask.taskId);

    assert.equal(spawnLog.length, 1);
    const recordedAttempt = service.getAttempt(spawnLog[0].attemptId);
    const recordedPolicy = recordedAttempt?.metadata?.effective_policy as TaskPolicy | undefined;
    assert.equal(recordedPolicy?.maxTokens, 100);

    const result: CodexAgentResult = {
      status: 'completed',
      summary: 'too many tokens',
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
      metrics: {
        tokens: 150,
      },
    };

    scheduler.handleAgentResult(
      policyTask.taskId,
      spawnLog[0].attemptId,
      spawnLog[0].agentName,
      spawnLog[0].role,
      result,
    );

    assert.equal(service.getTask(policyTask.taskId)?.status, 'waiting_on_human');
    assert.equal(spawnLog.length, 1);
    const budgetEvent = database
      .prepare('SELECT detail FROM budget_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(policyTask.taskId) as { detail: string } | undefined;
    assert.ok(budgetEvent);
    assert.ok(typeof budgetEvent.detail === 'string' && budgetEvent.detail.includes('max tokens'));

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('records global policy defaults with attempts when no overrides exist', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-policy-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, model?: string) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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

    const config = createTestConfig({
      policyDefaults: {
        maxTokens: 50,
        approvalPolicy: 'auto',
        maxParallelHelpers: 3,
        maxSameRoleHelpers: 2,
        localQueueTolerance: 5,
        cloudEscalationAllowed: true,
        priorityBias: 'time',
      },
    });
    const scheduler = new TaskScheduler(service, supervisorStub, config);
    const defaultTask = service.createTask({
      taskId: 'default-policy',
      name: 'Default Policy Task',
      priority: 'medium',
      metadata: {
        description: 'Use global defaults',
        task_type: 'plan',
      },
    });
    scheduler.handleNewTask(defaultTask.taskId);

    assert.equal(spawnLog.length, 1);
    const recordedAttempt = service.getAttempt(spawnLog[0].attemptId);
    const recordedPolicy = recordedAttempt?.metadata?.effective_policy as TaskPolicy | undefined;
    assert.equal(recordedPolicy?.maxTokens, 50);
    assert.equal(recordedPolicy?.approvalPolicy, 'auto');
    assert.equal(recordedPolicy?.maxParallelHelpers, 3);
    assert.equal(recordedPolicy?.maxSameRoleHelpers, 2);
    assert.equal(recordedPolicy?.localQueueTolerance, 5);
    assert.equal(recordedPolicy?.cloudEscalationAllowed, true);
    assert.equal(recordedPolicy?.priorityBias, 'time');

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('fans out bottleneck helpers before direct execution and records topology snapshots', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-bottleneck-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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

    const scheduler = new TaskScheduler(service, supervisorStub, createTestConfig({
      policyDefaults: {
        maxParallelHelpers: 3,
        maxSameRoleHelpers: 2,
      },
    }));

    const rootTask = service.createTask({
      taskId: 'allocator-root',
      name: 'Allocator root',
      priority: 'high',
      metadata: {
        description: 'Scan the repo and resolve open architectural questions across the codebase.',
        task_type: 'plan',
      },
    });
    service.recordTaskStateDigest({
      id: 'digest-allocator-root',
      taskId: rootTask.taskId,
      runId: run.runId,
      projectId: 'droidswarm',
      objective: 'Resolve bottlenecks before direct implementation.',
      currentPlan: ['Understand repo', 'Resolve questions'],
      decisions: [],
      openQuestions: ['Q1', 'Q2', 'Q3'],
      activeRisks: ['R1', 'R2'],
      artifactIndex: [],
      verificationState: 'planning',
      lastUpdatedBy: 'planner',
      ts: nowIso(),
    });

    scheduler.handleNewTask(rootTask.taskId);

    const tasks = service.getTasks().filter((task) => task.parentTaskId === rootTask.taskId);
    assert.ok(tasks.length >= 2);
    assert.ok(tasks.some((task) => task.metadata?.canonical_role === 'researcher'));
    assert.ok(tasks.some((task) => task.metadata?.canonical_role === 'repo-scanner'));
    assert.equal(service.getTask(rootTask.taskId)?.status, 'waiting_on_dependency');
    assert.equal(spawnLog.length, tasks.length);

    const topology = service.getRunRecord().metadata?.topology_snapshot as { helpers?: Array<{ role?: string }> } | undefined;
    assert.ok(topology);
    assert.ok((topology?.helpers?.length ?? 0) >= tasks.length);

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('triggers review gating when side-effect limits are reached', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-side-effects-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, model?: string) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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

    const reviewNotifications: Array<{ taskId: string; detail?: string }> = [];
    const config = createTestConfig({
      sideEffectActionsBeforeReview: 2,
    });
    const scheduler = new TaskScheduler(service, supervisorStub, config);
    scheduler.setEvents({
      onVerificationRequested: (taskId, _type, _requestedBy, detail) => {
        reviewNotifications.push({ taskId, detail });
      },
    });

    const task = service.createTask({
      taskId: 'side-effect-task',
      name: 'Side Effect Task',
      priority: 'medium',
      metadata: {
        description: 'Limit side effects',
        task_type: 'plan',
      },
    });

    scheduler.handleNewTask(task.taskId);
    assert.equal(spawnLog.length, 1);

    scheduler.handleArtifactRecorded(task.taskId, spawnLog[0].attemptId, 'artifact-write-1', 'side_effect', 'write file 1');
    assert.equal(service.getAttempt(spawnLog[0].attemptId)?.metadata?.side_effect_count, 1);

    scheduler.handleArtifactRecorded(task.taskId, spawnLog[0].attemptId, 'artifact-write-2', 'side_effect', 'write file 2');
    assert.equal(service.getAttempt(spawnLog[0].attemptId)?.metadata?.side_effect_count, 2);

    const parent = service.getTask(task.taskId);
    assert.equal(parent?.status, 'waiting_on_dependency');
    assert.equal(reviewNotifications.length, 1);
    assert.ok(reviewNotifications[0].detail?.includes('Side-effect limit'));

    const dependencies = service.listDependencies(task.taskId);
    const reviewChild = dependencies
      .map((dependency) => service.getTask(dependency.dependsOnTaskId))
      .find((child) => child?.metadata?.stage === 'review');
    assert.ok(reviewChild);

    const critics = spawnLog.filter((entry) => entry.role === 'critic');
    assert.equal(critics.length, 2, 'Each artifact should spawn a critic agent.');
    const criticStages = service.getTasks().filter((t) => t.metadata?.stage === 'artifact_verification');
    assert.equal(criticStages.length, 2, 'Two artifact verification stages should exist.');

    const budgetEvent = database
      .prepare('SELECT detail FROM budget_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(task.taskId) as { detail: string } | undefined;
    assert.ok(budgetEvent);
    assert.ok(budgetEvent.detail.includes('Side-effect limit'));

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('expands repo-scanner fanout in parallel for large repository tasks', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-parallel-scan-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{
      taskId: string;
      role: string;
      attemptId: string;
      agentName: string;
      options?: Record<string, unknown>;
    }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, model?: string, options?: Record<string, unknown>) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}`, options });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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
      cancelTask() {
        return [];
      },
    } as unknown as AgentSupervisor;

    const scheduler = new TaskScheduler(service, supervisorStub, createTestConfig({
      schedulerMaxFanOut: 5,
      maxAgentsPerTask: 5,
    }));
    const rootTask = service.createTask({
      taskId: 'parallel-root',
      name: 'Scan the monorepo',
      priority: 'high',
      metadata: {
        description: 'Large monorepo workspace with many packages to scan before planning.',
        task_type: 'plan',
      },
    });
    scheduler.handleNewTask(rootTask.taskId);

    const planResult: CodexAgentResult = {
      status: 'completed',
      summary: 'Need repo scanners',
      requested_agents: [{
        role: 'repo-scanner',
        reason: 'map the relevant packages',
        instructions: 'Scan the repository and map relevant code paths.',
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);

    const childTasks = service.getTasks().filter((task) => task.parentTaskId === rootTask.taskId);
    assert.equal(childTasks.length, 3);
    const parallelGroups = new Set(childTasks.map((task) => task.metadata?.parallel_group));
    assert.equal(parallelGroups.size, 1);
    assert.ok(childTasks.every((task) => task.metadata?.canonical_role === 'repo-scanner'));
    assert.ok(childTasks.every((task) => task.metadata?.parallel_total === 3));

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('creates an arbiter task when parallel reviewer outputs conflict', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-arbiter-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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
      cancelTask() {
        return [];
      },
    } as unknown as AgentSupervisor;

    const scheduler = new TaskScheduler(service, supervisorStub, createTestConfig({
      schedulerMaxFanOut: 5,
      maxAgentsPerTask: 5,
    }));
    const rootTask = service.createTask({
      taskId: 'arbiter-root',
      name: 'Review risky change',
      priority: 'urgent',
      metadata: {
        description: 'High risk change that needs parallel review.',
        task_type: 'plan',
        blocked_reason: 'high risk',
      },
    });
    scheduler.handleNewTask(rootTask.taskId);

    const planResult: CodexAgentResult = {
      status: 'completed',
      summary: 'Need multiple reviewers',
      requested_agents: [{
        role: 'reviewer',
        reason: 'review the risky diff',
        instructions: 'Review the proposed change and flag risks.',
      }],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };
    scheduler.handleAgentResult(rootTask.taskId, spawnLog[0].attemptId, spawnLog[0].agentName, spawnLog[0].role, planResult);

    const reviewerChildren = service.getTasks().filter((task) => task.parentTaskId === rootTask.taskId);
    assert.equal(reviewerChildren.length, 2);

    scheduler.handleAgentResult(
      reviewerChildren[0].taskId,
      spawnLog[1].attemptId,
      spawnLog[1].agentName,
      spawnLog[1].role,
      {
        success: true,
        engine: 'local-llama',
        model: 'llama',
        summary: 'Approve the change',
        timedOut: false,
        durationMs: 1000,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: [],
        },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: [],
          nextBestActions: [],
          evidenceRefs: [],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: 'approved',
        },
      },
    );
    scheduler.handleAgentResult(
      reviewerChildren[1].taskId,
      spawnLog[2].attemptId,
      spawnLog[2].agentName,
      spawnLog[2].role,
      {
        success: true,
        engine: 'local-llama',
        model: 'llama',
        summary: 'Reject the change because the migration is unsafe',
        timedOut: false,
        durationMs: 1000,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: [],
        },
        checkpointDelta: {
          factsAdded: [],
          decisionsAdded: [],
          openQuestions: [],
          risksFound: ['unsafe_migration'],
          nextBestActions: [],
          evidenceRefs: [],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          reasonCode: 'unsafe_migration',
        },
      },
    );

    const arbitrationTask = service
      .getTasks()
      .find((task) => task.parentTaskId === rootTask.taskId && task.metadata?.stage === 'arbitration');
    assert.ok(arbitrationTask);
    assert.equal(arbitrationTask?.metadata?.agent_role, 'arbiter');

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('queues checkpoint compression for digest-heavy tasks and resumes parent work after compression', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-compression-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string; options?: Record<string, unknown> }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId, _parentSummary?: string, _parentDroidspeak?: string, _model?: string, options?: Record<string, unknown>) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}`, options });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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
      cancelTask() {
        return [];
      },
    } as unknown as AgentSupervisor;

    const scheduler = new TaskScheduler(service, supervisorStub, createTestConfig({
      schedulerMaxFanOut: 5,
      maxAgentsPerTask: 5,
    }));
    const rootTask = service.createTask({
      taskId: 'compression-root',
      name: 'Long-running root task',
      priority: 'medium',
      metadata: {
        description: 'Large task with growing context.',
        task_type: 'plan',
      },
    });
    service.recordTaskStateDigest({
      id: 'digest-heavy',
      taskId: rootTask.taskId,
      runId: service.getRunRecord().runId,
      projectId: 'droidswarm',
      objective: 'Keep the task moving with compressed state.',
      currentPlan: ['step 1', 'step 2', 'step 3', 'step 4', 'step 5'],
      decisions: [],
      openQuestions: ['q1', 'q2', 'q3', 'q4'],
      activeRisks: ['risk-1'],
      artifactIndex: [
        { artifactId: 'a1', kind: 'summary', summary: 'artifact 1' },
        { artifactId: 'a2', kind: 'summary', summary: 'artifact 2' },
        { artifactId: 'a3', kind: 'summary', summary: 'artifact 3' },
        { artifactId: 'a4', kind: 'summary', summary: 'artifact 4' },
        { artifactId: 'a5', kind: 'summary', summary: 'artifact 5' },
        { artifactId: 'a6', kind: 'summary', summary: 'artifact 6' },
      ],
      verificationState: 'queued',
      lastUpdatedBy: 'planner-1',
      ts: nowIso(),
    });

    scheduler.handleNewTask(rootTask.taskId);

    assert.equal(spawnLog.length, 1);
    assert.equal(spawnLog[0].role, 'checkpoint-compressor');
    assert.equal(service.getTask(rootTask.taskId)?.status, 'waiting_on_dependency');

    const compressionTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId && task.metadata?.stage === 'checkpoint_compression');
    assert.ok(compressionTask);
    scheduler.handleAgentResult(
      compressionTask!.taskId,
      spawnLog[0].attemptId,
      spawnLog[0].agentName,
      spawnLog[0].role,
      {
        success: true,
        engine: 'local-llama',
        model: 'llama',
        summary: 'Compressed the checkpoint state for resumed work',
        timedOut: false,
        durationMs: 1000,
        activity: {
          filesRead: [],
          filesChanged: [],
          commandsRun: [],
          toolCalls: [],
        },
        checkpointDelta: {
          factsAdded: ['fact-1'],
          decisionsAdded: ['decision-1'],
          openQuestions: [],
          risksFound: [],
          nextBestActions: ['continue'],
          evidenceRefs: ['a1'],
        },
        artifacts: [],
        spawnRequests: [],
        budget: {},
        metadata: {
          compression: {
            scheme: 'droidspeak-v2',
            compressed_content: 'summary:emitted',
          },
        },
      },
    );

    assert.equal(service.getTask(compressionTask!.taskId)?.status, 'completed');
    assert.equal(service.getTask(rootTask.taskId)?.status, 'running');
    assert.equal(spawnLog[1]?.taskId, rootTask.taskId);
    assert.equal(spawnLog[1]?.role, 'planner');
    assert.deepEqual(service.getTask(rootTask.taskId)?.metadata?.last_compression_metrics, {
      artifactCount: 6,
      planSize: 5,
      openQuestions: 4,
      activeRisks: 1,
    });
    assert.equal(service.getLatestCheckpoint(rootTask.taskId)?.attemptId, spawnLog[0].attemptId);
    assert.equal(service.getLatestTaskStateDigest(rootTask.taskId)?.droidspeak?.kind, 'summary_emitted');

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('forces a local checkpoint-compression pass before large cloud escalations', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-scheduler-pre-cloud-'));
    const dbPath = path.join(workspace, 'state.db');
    const database = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(database);
    const service = new OrchestratorPersistenceService(persistence, persistence.createRun('droidswarm'));

    const spawnLog: Array<{ taskId: string; role: string; attemptId: string; agentName: string }> = [];
    const supervisorStub = {
      startAgentForTask(task, role, attemptId) {
        spawnLog.push({ taskId: task.taskId, role, attemptId, agentName: `test-${attemptId}` });
        return {
          agentName: `test-${attemptId}`,
          taskId: task.taskId,
          role,
          attemptId,
        };
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
      cancelTask() {
        return [];
      },
    } as unknown as AgentSupervisor;

    const scheduler = new TaskScheduler(service, supervisorStub, createTestConfig());
    const rootTask = service.createTask({
      taskId: 'cloud-root',
      name: 'Large refactor task',
      priority: 'high',
      metadata: {
        description: 'Large-scale multi-file refactor across the codebase.',
        task_type: 'implementation',
        agent_role: 'coder-backend',
        allow_cloud: true,
        queue_depth: 6,
        fallback_count: 2,
      },
    });
    service.recordTaskStateDigest({
      id: 'digest-cloud',
      taskId: rootTask.taskId,
      runId: service.getRunRecord().runId,
      projectId: 'droidswarm',
      objective: 'Prepare the large task for cloud execution.',
      currentPlan: ['scan files', 'compress context', 'apply refactor'],
      decisions: [],
      openQuestions: ['which packages are coupled?', 'what can be isolated?', 'which migrations are needed?'],
      activeRisks: [],
      artifactIndex: [
        { artifactId: 'ra1', kind: 'summary', summary: 'repo slice 1' },
        { artifactId: 'ra2', kind: 'summary', summary: 'repo slice 2' },
        { artifactId: 'ra3', kind: 'summary', summary: 'repo slice 3' },
      ],
      verificationState: 'queued',
      lastUpdatedBy: 'planner-1',
      ts: nowIso(),
    });

    scheduler.handleNewTask(rootTask.taskId);

    const compressionTask = service.getTasks().find((task) => task.parentTaskId === rootTask.taskId && task.metadata?.stage === 'checkpoint_compression');
    assert.ok(compressionTask);
    assert.equal(spawnLog[0]?.role, 'checkpoint-compressor');
    assert.equal(compressionTask?.metadata?.pre_cloud_compression, true);
    assert.equal(service.getTask(rootTask.taskId)?.status, 'waiting_on_dependency');

    database.close();
    rmSync(workspace, { recursive: true, force: true });
  });
});
