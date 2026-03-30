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
  agentName: 'Orchestrator',
  agentRole: 'control-plane',
  socketUrl: 'ws://localhost:8765',
  heartbeatMs: 1000,
  reconnectMs: 1000,
  codexBin: 'codex',
  codexSandboxMode: 'workspace-write',
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
    default: 'o1-preview',
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
    assert.equal(spawnLog.length, 2, 'child task should have been scheduled');

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
});
