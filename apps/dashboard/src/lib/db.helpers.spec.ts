import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { buildTaskGuardrails, buildTaskHandoffs } from './db';

describe('dashboard detail helpers', () => {
  it('builds handoffs from dependencies and plan events', () => {
    const handoffs = buildTaskHandoffs(['dep-1', 'dep-2'], ['Plan X', 'Plan Y']);
    assert.equal(handoffs.length, 4);
    assert.ok(handoffs.includes('Depends on dep-1'));
    assert.ok(handoffs.includes('Plan Y'));
  });

  it('falls back to placeholder when no handoffs exist', () => {
    const handoffs = buildTaskHandoffs([], []);
    assert.deepEqual(handoffs, []);
  });

  it('constructs guardrails from budgets and operator actions', () => {
    const guardrails = buildTaskGuardrails(false, [
      { detail: 'Side effect limit reached', consumed: 2 },
    ], [
      { actionType: 'cancel_task', detail: 'Operator stopped work' },
    ]);
    assert.ok(guardrails.some((line) => line.includes('Budget:')));
    assert.ok(guardrails.some((line) => line.includes('Operator cancel_task')));
  });

  it('adds clarification notice when requested', () => {
    const guardrails = buildTaskGuardrails(true, [], []);
    assert.equal(guardrails[0], 'Clarification requested by the creator.');
  });

  it('returns fallback guardrail when no data is available', () => {
    const guardrails = buildTaskGuardrails(false, [], []);
    assert.deepEqual(guardrails, ['No guardrail events recorded yet.']);
  });

  it('reads canonical digest and handoff state for task details', async () => {
    const { openPersistenceDatabase } = await import('../../../orchestrator/src/persistence/database.ts');
    const repositories = await import('../../../orchestrator/src/persistence/repositories.ts');
    const { buildDroidspeakV2 } = await import('../../../orchestrator/src/coordination.ts');
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-details-'));
    const dbPath = path.join(workspace, 'state.db');
    const originalDbPath = process.env.DROIDSWARM_DB_PATH;
    const originalProjectId = process.env.DROIDSWARM_PROJECT_ID;
    const database = openPersistenceDatabase(dbPath);
    const persistence = repositories.PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm');
    const now = new Date().toISOString();

    persistence.tasks.create({
      taskId: 'task-canonical',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      name: 'Canonical task',
      priority: 'medium',
      status: 'running',
      metadata: {
        description: 'Dashboard canonical detail test',
        task_type: 'task',
        created_by: 'tester',
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.attempts.create({
      attemptId: 'attempt-1',
      taskId: 'task-canonical',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      agentName: 'planner-1',
      status: 'completed',
      metadata: {
        role: 'planner',
        routing_decision: {
          engine: 'local-llama',
          modelTier: 'local-capable',
          queueDepth: 2,
          fallbackCount: 1,
          routeKind: 'parallel-local',
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    persistence.digests.record({
      id: 'digest-canonical',
      taskId: 'task-canonical',
      runId: run.runId,
      projectId: 'droidswarm',
      objective: 'Keep canonical digest visible.',
      currentPlan: ['Read digest', 'Read handoff'],
      decisions: ['Prefer canonical state'],
      openQuestions: ['Any blockers?'],
      activeRisks: ['Digest drift'],
      artifactIndex: [{
        artifactId: 'artifact-canonical',
        kind: 'summary',
        summary: 'Canonical artifact summary',
        reasonRelevant: 'This artifact captures the source-of-truth digest context.',
        trustConfidence: 0.92,
        sourceTaskId: 'task-canonical',
      }],
      verificationState: 'running',
      lastUpdatedBy: 'planner-1',
      ts: new Date().toISOString(),
      droidspeak: buildDroidspeakV2('memory_pinned', 'Canonical memory pinned.'),
    });
    persistence.handoffs.record({
      id: 'handoff-canonical',
      taskId: 'task-canonical',
      runId: run.runId,
      projectId: 'droidswarm',
      fromTaskId: 'task-canonical',
      toRole: 'researcher',
      digestId: 'digest-canonical',
      requiredReads: ['artifact-canonical'],
      summary: 'Canonical handoff summary',
      ts: new Date().toISOString(),
      droidspeak: buildDroidspeakV2('handoff_ready', 'Canonical handoff ready.'),
    });
    persistence.workers.recordResult({
      workerResultId: randomUUID(),
      runId: run.runId,
      taskId: 'task-canonical',
      attemptId: 'attempt-1',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'local-llama',
      model: 'local-model',
      modelTier: 'local-capable',
      queueDepth: 2,
      fallbackCount: 1,
      success: true,
      summary: 'Completed locally',
      payloadJson: JSON.stringify({
        metadata: {
          routeKind: 'parallel-local',
        },
      }),
      createdAt: new Date().toISOString(),
    });

    database.close();

    process.env.DROIDSWARM_DB_PATH = dbPath;
    process.env.DROIDSWARM_PROJECT_ID = 'droidswarm';

    const dashboardDb = await import(`./db.ts?task-details=${Date.now()}`);
    try {
      const details = dashboardDb.getTaskDetails('task-canonical');
      assert.ok(details);
      assert.equal(details?.handoffSource, 'canonical');
      assert.equal(details?.latestDigest?.id, 'digest-canonical');
      assert.equal(details?.latestHandoff?.id, 'handoff-canonical');
      assert.equal(details?.latestHandoff?.requiredReads[0], 'artifact-canonical');
      assert.equal(details?.latestRoutingTelemetry?.modelTier, 'local-capable');
      assert.equal(details?.latestDigest?.artifactIndex[0]?.reasonRelevant, 'This artifact captures the source-of-truth digest context.');
      assert.equal(details?.bestCurrentUnderstanding?.objective, 'Keep canonical digest visible.');
      assert.equal(details?.bestCurrentUnderstanding?.keyFindings[0], 'Prefer canonical state');
      assert.equal(details?.bestCurrentUnderstanding?.latestHandoffSummary, 'Canonical handoff summary');
    } finally {
      dashboardDb.resetDatabaseInstance();
      if (originalDbPath == null) {
        delete process.env.DROIDSWARM_DB_PATH;
      } else {
        process.env.DROIDSWARM_DB_PATH = originalDbPath;
      }
      if (originalProjectId == null) {
        delete process.env.DROIDSWARM_PROJECT_ID;
      } else {
        process.env.DROIDSWARM_PROJECT_ID = originalProjectId;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('aggregates run routing telemetry from persisted attempts, results, and heartbeats', async () => {
    const { openPersistenceDatabase } = await import('../../../orchestrator/src/persistence/database.ts');
    const repositories = await import('../../../orchestrator/src/persistence/repositories.ts');
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-routing-'));
    const dbPath = path.join(workspace, 'state.db');
    const originalDbPath = process.env.DROIDSWARM_DB_PATH;
    const originalProjectId = process.env.DROIDSWARM_PROJECT_ID;
    const database = openPersistenceDatabase(dbPath);
    const persistence = repositories.PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm');
    const now = new Date().toISOString();

    persistence.tasks.create({
      taskId: 'task-routing',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      name: 'Routing task',
      priority: 'medium',
      status: 'running',
      metadata: {
        description: 'Routing summary test',
        task_type: 'task',
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.attempts.create({
      attemptId: 'attempt-routing',
      taskId: 'task-routing',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      agentName: 'planner-1',
      status: 'completed',
      metadata: {
        role: 'planner',
        routing_decision: {
          engine: 'codex-cloud',
          modelTier: 'cloud-deep',
          routeKind: 'cloud-escalated',
          escalationReason: 'local_saturated',
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.workers.recordResult({
      workerResultId: randomUUID(),
      runId: run.runId,
      taskId: 'task-routing',
      attemptId: 'attempt-routing',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'codex-cloud',
      model: 'gpt',
      modelTier: 'cloud-deep',
      queueDepth: 3,
      fallbackCount: 2,
      success: true,
      summary: 'Escalated successfully',
      payloadJson: JSON.stringify({}),
      createdAt: now,
    });
    persistence.workers.recordHeartbeat({
      heartbeatId: 'heartbeat-routing',
      runId: run.runId,
      taskId: 'task-routing',
      attemptId: 'attempt-routing',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'codex-cloud',
      modelTier: 'cloud-deep',
      queueDepth: 3,
      fallbackCount: 2,
      status: 'running',
      elapsedMs: 2400,
      lastActivity: 'planning',
      timestamp: now,
    });

    database.close();

    process.env.DROIDSWARM_DB_PATH = dbPath;
    process.env.DROIDSWARM_PROJECT_ID = 'droidswarm';

    const dashboardDb = await import(`./db.ts?run-routing=${Date.now()}`);
    try {
      const telemetry = dashboardDb.getRunRoutingTelemetry(run.runId);
      assert.ok(telemetry);
      assert.equal(telemetry?.modelTierCounts[0]?.modelTier, 'cloud-deep');
      assert.equal(telemetry?.averageQueueDepth, 3);
      assert.equal(telemetry?.averageFallbackCount, 2);
      assert.equal(telemetry?.cloudEscalationCount, 1);
      assert.equal(telemetry?.escalationReasons[0]?.reason, 'local_saturated');
      assert.equal(telemetry?.averageLatencyByRoleAndEngine[0]?.averageElapsedMs, 2400);
    } finally {
      dashboardDb.resetDatabaseInstance();
      if (originalDbPath == null) {
        delete process.env.DROIDSWARM_DB_PATH;
      } else {
        process.env.DROIDSWARM_DB_PATH = originalDbPath;
      }
      if (originalProjectId == null) {
        delete process.env.DROIDSWARM_PROJECT_ID;
      } else {
        process.env.DROIDSWARM_PROJECT_ID = originalProjectId;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('reads allocator policy and topology snapshots from the current run', async () => {
    const { openPersistenceDatabase } = await import('../../../orchestrator/src/persistence/database.ts');
    const repositories = await import('../../../orchestrator/src/persistence/repositories.ts');
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-topology-'));
    const dbPath = path.join(workspace, 'state.db');
    const originalDbPath = process.env.DROIDSWARM_DB_PATH;
    const originalProjectId = process.env.DROIDSWARM_PROJECT_ID;
    const database = openPersistenceDatabase(dbPath);
    const persistence = repositories.PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm', {
      metadata: {
        allocator_policy: {
          maxParallelHelpers: 4,
          maxSameRoleHelpers: 2,
          localQueueTolerance: 3,
          cloudEscalationAllowed: true,
          priorityBias: 'time',
        },
      },
    });
    const now = new Date().toISOString();

    persistence.tasks.create({
      taskId: 'task-topology',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      name: 'Topology task',
      priority: 'medium',
      status: 'running',
      metadata: {
        description: 'Topology snapshot test',
        task_type: 'task',
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.attempts.create({
      attemptId: 'attempt-topology',
      taskId: 'task-topology',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      agentName: 'researcher-1',
      status: 'running',
      metadata: {
        role: 'researcher',
        model_tier: 'local-cheap',
        queue_depth: 1,
        fallback_count: 0,
        routing_decision: {
          routeKind: 'planner-local',
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.assignments.assign({
      assignmentId: 'assignment-topology',
      attemptId: 'attempt-topology',
      agentName: 'researcher-1',
      assignedAt: now,
    });
    const snapshot = persistence.buildSwarmTopologySnapshot(run.runId);
    persistence.runs.updateMetadata(run.runId, {
      ...(run.metadata ?? {}),
      topology_snapshot: snapshot,
    });

    database.close();

    process.env.DROIDSWARM_DB_PATH = dbPath;
    process.env.DROIDSWARM_PROJECT_ID = 'droidswarm';

    const dashboardDb = await import(`./db.ts?topology=${Date.now()}`);
    try {
      const policy = dashboardDb.getRunAllocatorPolicy(run.runId);
      const topology = dashboardDb.getRunTopology(run.runId);
      assert.ok(policy);
      assert.equal(policy?.maxParallelHelpers, 4);
      assert.equal(policy?.priorityBias, 'time');
      assert.ok(topology);
      assert.equal(topology?.activeRoles[0]?.role, 'researcher');
      assert.equal(topology?.helpers[0]?.agentName, 'researcher-1');
      assert.equal(topology?.helpers[0]?.routeKind, 'planner-local');
    } finally {
      dashboardDb.resetDatabaseInstance();
      if (originalDbPath == null) {
        delete process.env.DROIDSWARM_DB_PATH;
      } else {
        process.env.DROIDSWARM_DB_PATH = originalDbPath;
      }
      if (originalProjectId == null) {
        delete process.env.DROIDSWARM_PROJECT_ID;
      } else {
        process.env.DROIDSWARM_PROJECT_ID = originalProjectId;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('aggregates Blink, llama.cpp, and Mux service attribution from persisted run state', async () => {
    const { openPersistenceDatabase } = await import('../../../orchestrator/src/persistence/database.ts');
    const repositories = await import('../../../orchestrator/src/persistence/repositories.ts');
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-service-usage-'));
    const dbPath = path.join(workspace, 'state.db');
    const originalDbPath = process.env.DROIDSWARM_DB_PATH;
    const originalProjectId = process.env.DROIDSWARM_PROJECT_ID;
    const originalSwarmId = process.env.DROIDSWARM_SWARM_ID;
    const originalDroidswarmHome = process.env.DROIDSWARM_HOME;
    const database = openPersistenceDatabase(dbPath);
    const persistence = repositories.PersistenceClient.fromDatabase(database);
    const run = persistence.createRun('droidswarm');
    const now = new Date().toISOString();

    persistence.tasks.create({
      taskId: 'task-service-usage',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      name: 'Service usage task',
      priority: 'medium',
      status: 'running',
      metadata: {
        description: 'Service usage aggregation test',
        task_type: 'task',
      },
      createdAt: now,
      updatedAt: now,
    });

    database.prepare(`
      INSERT INTO project_chat_bindings (
        binding_id, project_id, task_id, provider, external_thread_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'binding-service-usage',
      'droidswarm',
      'task-service-usage',
      'slack',
      'C123',
      JSON.stringify({ linked: true }),
      now,
      now,
    );

    persistence.chat.create({
      id: 'chat-mirrored',
      taskId: 'task-service-usage',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      source: 'dashboard',
      authorType: 'agent',
      authorId: 'planner-1',
      body: 'Mirrored successfully',
      metadata: {
        mirrored: true,
        provider: 'slack',
        mirror_attempts: 2,
      },
      createdAt: now,
    });
    persistence.chat.create({
      id: 'chat-failed',
      taskId: 'task-service-usage',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      source: 'dashboard',
      authorType: 'agent',
      authorId: 'planner-1',
      body: 'Mirror failed',
      metadata: {
        mirrored: false,
        provider: 'slack',
        mirror_attempts: 3,
        mirror_last_error: 'Slack rate limited',
      },
      createdAt: now,
    });

    persistence.attempts.create({
      attemptId: 'attempt-llama',
      taskId: 'task-service-usage',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      workspaceId: 'ws-1',
      agentName: 'planner-1',
      status: 'completed',
      metadata: {
        role: 'planner',
        mux_session_id: 'mux-ws-1',
        routing_decision: {
          engine: 'local-llama',
          modelTier: 'local-capable',
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.attempts.create({
      attemptId: 'attempt-cloud',
      taskId: 'task-service-usage',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      workspaceId: 'ws-2',
      agentName: 'reviewer-1',
      status: 'completed',
      metadata: {
        role: 'reviewer',
        mux_session_id: 'mux-ws-2',
        routing_decision: {
          engine: 'codex-cloud',
          modelTier: 'cloud',
          escalationReason: 'local_saturated',
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    persistence.attempts.create({
      attemptId: 'attempt-mux',
      taskId: 'task-service-usage',
      runId: run.runId,
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      workspaceId: 'ws-3',
      agentName: 'repo-scanner-1',
      status: 'completed',
      metadata: {
        role: 'repo-scanner',
        mux_session_id: 'mux-ws-3',
        routing_decision: {
          engine: 'mux-local',
          modelTier: 'local-cheap',
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    persistence.workers.recordResult({
      workerResultId: randomUUID(),
      runId: run.runId,
      taskId: 'task-service-usage',
      attemptId: 'attempt-llama',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'local-llama',
      model: 'llama',
      modelTier: 'local-capable',
      queueDepth: 1,
      fallbackCount: 0,
      success: true,
      summary: 'Local planner success',
      payloadJson: JSON.stringify({ durationMs: 1200 }),
      createdAt: now,
    });
    persistence.workers.recordResult({
      workerResultId: randomUUID(),
      runId: run.runId,
      taskId: 'task-service-usage',
      attemptId: 'attempt-cloud',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'codex-cloud',
      model: 'gpt',
      modelTier: 'cloud',
      queueDepth: 5,
      fallbackCount: 2,
      success: true,
      summary: 'Cloud review success',
      payloadJson: JSON.stringify({ durationMs: 2200 }),
      createdAt: now,
    });
    persistence.workers.recordResult({
      workerResultId: randomUUID(),
      runId: run.runId,
      taskId: 'task-service-usage',
      attemptId: 'attempt-mux',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'mux-local',
      model: 'mux',
      modelTier: 'local-cheap',
      queueDepth: 0,
      fallbackCount: 0,
      success: true,
      summary: 'Mux repo scan success',
      payloadJson: JSON.stringify({ durationMs: 400 }),
      createdAt: now,
    });
    persistence.workers.recordHeartbeat({
      heartbeatId: 'heartbeat-llama',
      runId: run.runId,
      taskId: 'task-service-usage',
      attemptId: 'attempt-llama',
      projectId: 'droidswarm',
      repoId: 'droidswarm-repo',
      rootPath: '/',
      branch: 'main',
      engine: 'local-llama',
      modelTier: 'local-capable',
      queueDepth: 1,
      fallbackCount: 0,
      status: 'running',
      elapsedMs: 1200,
      lastActivity: 'planning',
      timestamp: now,
    });

    database.close();

    process.env.DROIDSWARM_DB_PATH = dbPath;
    process.env.DROIDSWARM_PROJECT_ID = 'droidswarm';
    process.env.DROIDSWARM_SWARM_ID = 'swarm-service-usage';
    process.env.DROIDSWARM_HOME = workspace;
    const swarmDir = path.join(workspace, 'swarms', 'swarm-service-usage');
    mkdirSync(swarmDir, { recursive: true });
    writeFileSync(path.join(swarmDir, 'service-health.json'), JSON.stringify({
      updatedAt: now,
      allReady: false,
      blink: { status: 'running', reachable: true, url: 'http://127.0.0.1:3001' },
      mux: { status: 'running', reachable: true, url: 'http://127.0.0.1:3003' },
      llama: {
        status: 'retrying',
        reachable: false,
        url: 'http://127.0.0.1:11435',
        model: 'default.gguf',
        modelPresent: true,
        inventoryPresent: true,
        inventoryCount: 1,
        inventoryHasSelected: true,
      },
    }));

    const dashboardDb = await import(`./db.ts?service-usage=${Date.now()}`);
    try {
      const usage = dashboardDb.getRunServiceUsage(run.runId);
      assert.ok(usage);
      assert.equal(usage?.blink.mirroredMessages, 1);
      assert.equal(usage?.blink.failureCount, 1);
      assert.equal(usage?.blink.retryCount, 3);
      assert.equal(usage?.llama.requestCount, 1);
      assert.equal(usage?.llama.failureCount, 0);
      assert.equal(usage?.llama.averageLatencyMs, 1200);
      assert.equal(usage?.llama.localCoveragePercent, 50);
      assert.equal(usage?.llama.cloudBypassRatePercent, 50);
      assert.equal(usage?.llama.bypassReasons[0]?.reason, 'local_saturated');
      assert.equal(usage?.mux.workspaceLeaseCount, 3);
      assert.equal(usage?.mux.brokeredExecutionCount, 1);
      assert.equal(usage?.mux.assessment, 'active-broker');
      assert.equal(usage?.health?.blink.reachable, true);
      assert.equal(usage?.health?.llama.reachable, false);
      assert.equal(usage?.policy.status, 'action-needed');
      assert.ok(usage?.policy.actions.some((action) => action.includes('llama.cpp is not reachable')));
      assert.ok(usage?.policy.actions.some((action) => action.includes('80% local coverage target')));
    } finally {
      dashboardDb.resetDatabaseInstance();
      if (originalDbPath == null) {
        delete process.env.DROIDSWARM_DB_PATH;
      } else {
        process.env.DROIDSWARM_DB_PATH = originalDbPath;
      }
      if (originalProjectId == null) {
        delete process.env.DROIDSWARM_PROJECT_ID;
      } else {
        process.env.DROIDSWARM_PROJECT_ID = originalProjectId;
      }
      if (originalSwarmId == null) {
        delete process.env.DROIDSWARM_SWARM_ID;
      } else {
        process.env.DROIDSWARM_SWARM_ID = originalSwarmId;
      }
      if (originalDroidswarmHome == null) {
        delete process.env.DROIDSWARM_HOME;
      } else {
        process.env.DROIDSWARM_HOME = originalDroidswarmHome;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
