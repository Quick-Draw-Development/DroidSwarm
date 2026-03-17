import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CodexAgentResult, MessageEnvelope, OrchestratorConfig, RunRecord } from './types';
import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { OrchestratorPersistenceService } from './persistence/service';
import { TaskScheduler } from './scheduler/TaskScheduler';
import { OrchestratorEngine } from './engine/OrchestratorEngine';
import { TaskRegistry } from './task-registry';
import { OperatorActionService } from './operator/OperatorActionService';
import { SocketGateway } from './socket/SocketGateway';
import { AgentSupervisor } from './AgentSupervisor';
import { OperatorChatResponder } from './operator/OperatorChatResponder';
import { RunLifecycleService } from './run-lifecycle';

const DEFAULT_CONFIG: OrchestratorConfig = {
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
  maxConcurrentCodeAgents: 2,
  specDir: '',
  orchestratorRules: '',
  droidspeakRules: '',
  agentRules: '',
  dbPath: '',
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 250,
  sideEffectActionsBeforeReview: 0,
  allowedTools: [],
};

type SupervisorCallbacks = {
  onAgentsAssigned?: (taskId: string, agents: Array<{ agentName: string; role: string; attemptId: string }>) => void;
  onAgentCommunication?: (taskId: string, message: string) => void;
  onAgentResult?: (
    taskId: string,
    attemptId: string,
    agentName: string,
    role: string,
    result: CodexAgentResult,
  ) => void;
};

class StubSupervisor {
  public readonly assigned: Array<{ agentName: string; taskId: string; role: string; attemptId: string }> = [];
  private readonly attemptMap = new Map<string, { agentName: string; taskId: string; role: string }>();
  private callbacks: SupervisorCallbacks = {};

  setCallbacks(callbacks: Partial<SupervisorCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  startAgentForTask(task: { taskId: string }, role: string, attemptId: string): { agentName: string; taskId: string; role: string; attemptId: string } {
    const agentName = `${task.taskId}-${role}-${attemptId.slice(0, 6)}`;
    const spawned = { agentName, taskId: task.taskId, role, attemptId };
    this.assigned.push(spawned);
    this.attemptMap.set(attemptId, spawned);
    this.callbacks.onAgentsAssigned?.(task.taskId, [spawned]);
    return spawned;
  }

  cancelTask(taskId: string): string[] {
    const removed = this.assigned.filter((entry) => entry.taskId === taskId).map((entry) => entry.agentName);
    this.assigned.splice(0, this.assigned.length, ...this.assigned.filter((entry) => entry.taskId !== taskId));
    for (const [attemptId, entry] of this.attemptMap.entries()) {
      if (entry.taskId === taskId) {
        this.attemptMap.delete(attemptId);
      }
    }
    return removed;
  }

  getActiveAgentCount(): number {
    return this.assigned.length;
  }

  countActiveAgents(predicate?: (agent: { role: string; taskId: string }) => boolean): number {
    if (!predicate) {
      return this.assigned.length;
    }
    return this.assigned.filter(predicate).length;
  }

  getLastSpawned(): { agentName: string; taskId: string; role: string; attemptId: string } | undefined {
    return this.assigned[this.assigned.length - 1];
  }
}

class StubGateway {
  public readonly sent: MessageEnvelope[] = [];
  public readonly channels = new Set<string>();

  send(message: MessageEnvelope): void {
    this.sent.push(message);
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
  database: ReturnType<typeof openPersistenceDatabase>;
  run: RunRecord;
  dbPath: string;
  workspace: string;
  close: () => void;
  destroy: () => void;
};

const buildConfig = (dbPath: string): OrchestratorConfig => ({
  ...DEFAULT_CONFIG,
  dbPath,
});

const createEnvironment = (options?: { dbPath?: string; run?: RunRecord }): Environment => {
  const workspace = options?.dbPath ? path.dirname(options.dbPath) : mkdtempSync(path.join(tmpdir(), 'droidswarm-phase10-'));
  const dbPath = options?.dbPath ?? path.join(workspace, 'state.db');
  const database = openPersistenceDatabase(dbPath);
  const persistence = PersistenceClient.fromDatabase(database);
  const run = options?.run ?? persistence.createRun(DEFAULT_CONFIG.projectId);
  const service = new OrchestratorPersistenceService(persistence, run);
  const supervisor = new StubSupervisor();
  const gateway = new StubGateway();
  const schedulerConfig = buildConfig(dbPath);
  const scheduler = new TaskScheduler(service, supervisor as unknown as AgentSupervisor, schedulerConfig);
  const chatResponder = new StubChatResponder(schedulerConfig);
  const controlService = new OperatorActionService(service, supervisor as unknown as AgentSupervisor);
  const registry = new TaskRegistry();
  const engine = new OrchestratorEngine({
    config: schedulerConfig,
    persistenceService: service,
    scheduler,
    supervisor: supervisor as unknown as AgentSupervisor,
    gateway: gateway as unknown as SocketGateway,
    chatResponder,
    controlService,
    registry,
    runLifecycle: new RunLifecycleService(persistence),
  });
  scheduler.setEvents({
    onPlanProposed: engine.onPlanProposed,
    onCheckpointCreated: engine.onCheckpointCreated,
    onVerificationRequested: engine.onVerificationRequested,
    onVerificationOutcome: engine.onVerificationOutcome,
  });
  supervisor.setCallbacks({
    onAgentsAssigned: engine.handleAgentAssignment.bind(engine),
    onAgentCommunication: engine.handleAgentCommunication.bind(engine),
    onAgentResult: scheduler.handleAgentResult.bind(scheduler),
  });

  return {
    engine,
    scheduler,
    service,
    supervisor,
    gateway,
    database,
    run,
    dbPath,
    workspace,
    close: () => database.close(),
    destroy: () => {
      database.close();
      rmSync(workspace, { recursive: true, force: true });
    },
  };
};

const buildTaskCreatedMessage = (taskId: string, timestamp?: string): MessageEnvelope => ({
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
  timestamp: timestamp ?? new Date().toISOString(),
  payload: {
    task_id: taskId,
    title: 'Phase 10 epic',
    description: 'Drive orchestration end-to-end',
    task_type: 'feature',
    priority: 'high',
    created_by: 'operator',
  },
});

const planResult: CodexAgentResult = {
  status: 'completed',
  summary: 'Plan ready',
  requested_agents: [{
    role: 'coder',
    reason: 'implementation',
    instructions: 'Implement the feature.',
  }],
  artifacts: [],
  doc_updates: [],
  branch_actions: [],
};

const simpleResult = (status: CodexAgentResult['status'], summary: string): CodexAgentResult => ({
  status,
  summary,
  requested_agents: [],
  artifacts: [],
  doc_updates: [],
  branch_actions: [],
});

describe('Phase 10 orchestrator flows', () => {
  it('runs a task from intake through verification and review', async () => {
    const env = createEnvironment();
    const message = buildTaskCreatedMessage('phase10-root');

    await env.engine.handleMessage(message, 'operator');
    assert.equal(env.supervisor.assigned.length, 1);
    const rootSpawn = env.supervisor.assigned[0];

    env.scheduler.handleAgentResult(
      rootSpawn.taskId,
      rootSpawn.attemptId,
      rootSpawn.agentName,
      rootSpawn.role,
      planResult,
    );

    const childSpawn = env.supervisor.assigned[1];
    assert.ok(childSpawn);
    const childTaskId = childSpawn.taskId;
    env.scheduler.handleAgentResult(
      childTaskId,
      childSpawn.attemptId,
      childSpawn.agentName,
      childSpawn.role,
      simpleResult('completed', 'child done'),
    );

    const rootTask = env.service.getTask(rootSpawn.taskId);
    assert.equal(rootTask?.status, 'in_review');

    const verificationSpawn = env.supervisor.assigned[2];
    assert.ok(verificationSpawn);
    env.scheduler.handleAgentResult(
      verificationSpawn.taskId,
      verificationSpawn.attemptId,
      verificationSpawn.agentName,
      verificationSpawn.role,
      simpleResult('completed', 'verification passed'),
    );

    const reviewSpawn = env.supervisor.assigned[3];
    assert.ok(reviewSpawn);
    env.scheduler.handleAgentResult(
      reviewSpawn.taskId,
      reviewSpawn.attemptId,
      reviewSpawn.agentName,
      reviewSpawn.role,
      simpleResult('completed', 'review passed'),
    );

    const finalRoot = env.service.getTask(rootSpawn.taskId);
    assert.equal(finalRoot?.status, 'verified');
    env.destroy();
  });

  it('cancels a task via operator status updates', async () => {
    const env = createEnvironment();
    const message = buildTaskCreatedMessage('phase10-cancel');

    await env.engine.handleMessage(message, 'operator');
    assert.equal(env.supervisor.assigned.length, 1);

    const cancelMessage: MessageEnvelope = {
      message_id: 'cancel-1',
      project_id: DEFAULT_CONFIG.projectId,
      room_id: 'operator',
      task_id: 'phase10-cancel',
      type: 'status_update',
      from: {
        actor_type: 'human',
        actor_id: 'operator-1',
        actor_name: 'operator',
      },
      timestamp: new Date().toISOString(),
      payload: {
        status_code: 'task_cancelled',
        metadata: {
          task_id: 'phase10-cancel',
          status: 'cancelled',
        },
      },
    };

    await env.engine.handleMessage(cancelMessage, 'operator');
    const task = env.service.getTask('phase10-cancel');
    assert.equal(task?.status, 'cancelled');
    assert.equal(env.supervisor.getActiveAgentCount(), 0);
    env.destroy();
  });

  it('resumes queued work after a restart', async () => {
    const env1 = createEnvironment();
    const message = buildTaskCreatedMessage('phase10-restart');

    await env1.engine.handleMessage(message, 'operator');
    const rootSpawn = env1.supervisor.assigned[0];
    env1.scheduler.handleAgentResult(
      rootSpawn.taskId,
      rootSpawn.attemptId,
      rootSpawn.agentName,
      rootSpawn.role,
      planResult,
    );

    const childSpawn = env1.supervisor.assigned[1];
    const childTaskId = childSpawn.taskId;
    assert.equal(env1.service.getTask(childTaskId)?.status, 'running');

    env1.close();
    const env2 = createEnvironment({ dbPath: env1.dbPath, run: env1.run });
    env2.scheduler.handleNewTask(childTaskId);
    assert.equal(env2.supervisor.assigned.length, 1);
    assert.equal(env2.service.getTask(childTaskId)?.status, 'running');
    env2.destroy();
  });
});
