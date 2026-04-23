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

  it('aggregates llama.cpp service attribution from persisted run state', async () => {
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
        routing_decision: {
          engine: 'codex-cloud',
          modelTier: 'cloud',
          escalationReason: 'local_saturated',
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
      assert.equal(usage?.llama.requestCount, 1);
      assert.equal(usage?.llama.failureCount, 0);
      assert.equal(usage?.llama.averageLatencyMs, 1200);
      assert.equal(usage?.llama.localCoveragePercent, 50);
      assert.equal(usage?.llama.cloudBypassRatePercent, 50);
      assert.equal(usage?.llama.bypassReasons[0]?.reason, 'local_saturated');
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

  it('reads federation status from a swarm snapshot', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-federation-snapshot-'));
    const swarmId = 'swarm-federation-snapshot';
    const swarmDir = path.join(workspace, 'swarms', swarmId);
    const originalHome = process.env.DROIDSWARM_HOME;
    const originalSwarmId = process.env.DROIDSWARM_SWARM_ID;
    const now = new Date().toISOString();
    mkdirSync(swarmDir, { recursive: true });
    writeFileSync(path.join(swarmDir, 'federation-status.json'), JSON.stringify({
      enabled: true,
      state: 'active',
      nodeId: 'node-a',
      host: '127.0.0.1',
      busPort: 4947,
      adminPort: 4950,
      busUrl: 'http://127.0.0.1:4947',
      adminUrl: 'http://127.0.0.1:4950',
      peerCount: 2,
      recentEventCount: 7,
      peers: [
        {
          peerId: 'node-b',
          busUrl: 'http://10.0.0.2:4947',
          adminUrl: 'http://10.0.0.2:4950',
          capabilities: ['heartbeat', 'kick'],
        },
        {
          peerId: 'node-c',
          busUrl: 'http://10.0.0.3:4947',
          adminUrl: 'http://10.0.0.3:4950',
          capabilities: ['heartbeat'],
          lastHeartbeatAt: now,
        },
      ],
      updatedAt: now,
    }));

    process.env.DROIDSWARM_HOME = workspace;
    process.env.DROIDSWARM_SWARM_ID = swarmId;

    const dashboardDb = await import(`./db.ts?federation-snapshot=${Date.now()}`);
    try {
      const federation = dashboardDb.getFederationStatus();
      assert.ok(federation);
      assert.equal(federation?.enabled, true);
      assert.equal(federation?.state, 'active');
      assert.equal(federation?.busUrl, 'http://127.0.0.1:4947');
      assert.equal(federation?.adminUrl, 'http://127.0.0.1:4950');
      assert.equal(federation?.peerCount, 2);
      assert.equal(federation?.recentEventCount, 7);
      assert.equal(federation?.peers[0]?.peerId, 'node-b');
      assert.equal(federation?.peers[1]?.lastHeartbeatAt, now);
    } finally {
      dashboardDb.resetDatabaseInstance();
      if (originalHome == null) {
        delete process.env.DROIDSWARM_HOME;
      } else {
        process.env.DROIDSWARM_HOME = originalHome;
      }
      if (originalSwarmId == null) {
        delete process.env.DROIDSWARM_SWARM_ID;
      } else {
        process.env.DROIDSWARM_SWARM_ID = originalSwarmId;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('falls back to federation env values when no snapshot is present', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-federation-env-'));
    const swarmId = 'swarm-federation-env';
    const swarmDir = path.join(workspace, 'swarms', swarmId);
    const originalHome = process.env.DROIDSWARM_HOME;
    const originalSwarmId = process.env.DROIDSWARM_SWARM_ID;
    const originalEnabled = process.env.DROIDSWARM_ENABLE_FEDERATION;
    const originalNodeId = process.env.DROIDSWARM_FEDERATION_NODE_ID;
    const originalHost = process.env.DROIDSWARM_FEDERATION_HOST;
    const originalBusPort = process.env.DROIDSWARM_FEDERATION_BUS_PORT;
    const originalAdminPort = process.env.DROIDSWARM_FEDERATION_ADMIN_PORT;
    const originalBusUrl = process.env.DROIDSWARM_FEDERATION_BUS_URL;
    const originalAdminUrl = process.env.DROIDSWARM_FEDERATION_ADMIN_URL;
    const originalPeers = process.env.DROIDSWARM_FEDERATION_PEERS;
    mkdirSync(swarmDir, { recursive: true });

    process.env.DROIDSWARM_HOME = workspace;
    process.env.DROIDSWARM_SWARM_ID = swarmId;
    process.env.DROIDSWARM_ENABLE_FEDERATION = 'true';
    process.env.DROIDSWARM_FEDERATION_NODE_ID = 'node-env';
    process.env.DROIDSWARM_FEDERATION_HOST = '0.0.0.0';
    process.env.DROIDSWARM_FEDERATION_BUS_PORT = '4947';
    process.env.DROIDSWARM_FEDERATION_ADMIN_PORT = '4950';
    process.env.DROIDSWARM_FEDERATION_BUS_URL = 'http://127.0.0.1:4947';
    process.env.DROIDSWARM_FEDERATION_ADMIN_URL = 'http://127.0.0.1:4950';
    process.env.DROIDSWARM_FEDERATION_PEERS = 'http://10.0.0.4:4947';

    const dashboardDb = await import(`./db.ts?federation-env=${Date.now()}`);
    try {
      const federation = dashboardDb.getFederationStatus();
      assert.ok(federation);
      assert.equal(federation?.enabled, true);
      assert.equal(federation?.state, 'active');
      assert.equal(federation?.nodeId, 'node-env');
      assert.equal(federation?.busUrl, 'http://127.0.0.1:4947');
      assert.equal(federation?.adminUrl, 'http://127.0.0.1:4950');
      assert.equal(federation?.peerCount, 1);
      assert.equal(federation?.peers[0]?.peerId, '10.0.0.4:4947');
      assert.equal(federation?.recentEventCount, undefined);
    } finally {
      dashboardDb.resetDatabaseInstance();
      if (originalHome == null) {
        delete process.env.DROIDSWARM_HOME;
      } else {
        process.env.DROIDSWARM_HOME = originalHome;
      }
      if (originalSwarmId == null) {
        delete process.env.DROIDSWARM_SWARM_ID;
      } else {
        process.env.DROIDSWARM_SWARM_ID = originalSwarmId;
      }
      if (originalEnabled == null) {
        delete process.env.DROIDSWARM_ENABLE_FEDERATION;
      } else {
        process.env.DROIDSWARM_ENABLE_FEDERATION = originalEnabled;
      }
      if (originalNodeId == null) {
        delete process.env.DROIDSWARM_FEDERATION_NODE_ID;
      } else {
        process.env.DROIDSWARM_FEDERATION_NODE_ID = originalNodeId;
      }
      if (originalHost == null) {
        delete process.env.DROIDSWARM_FEDERATION_HOST;
      } else {
        process.env.DROIDSWARM_FEDERATION_HOST = originalHost;
      }
      if (originalBusPort == null) {
        delete process.env.DROIDSWARM_FEDERATION_BUS_PORT;
      } else {
        process.env.DROIDSWARM_FEDERATION_BUS_PORT = originalBusPort;
      }
      if (originalAdminPort == null) {
        delete process.env.DROIDSWARM_FEDERATION_ADMIN_PORT;
      } else {
        process.env.DROIDSWARM_FEDERATION_ADMIN_PORT = originalAdminPort;
      }
      if (originalBusUrl == null) {
        delete process.env.DROIDSWARM_FEDERATION_BUS_URL;
      } else {
        process.env.DROIDSWARM_FEDERATION_BUS_URL = originalBusUrl;
      }
      if (originalAdminUrl == null) {
        delete process.env.DROIDSWARM_FEDERATION_ADMIN_URL;
      } else {
        process.env.DROIDSWARM_FEDERATION_ADMIN_URL = originalAdminUrl;
      }
      if (originalPeers == null) {
        delete process.env.DROIDSWARM_FEDERATION_PEERS;
      } else {
        process.env.DROIDSWARM_FEDERATION_PEERS = originalPeers;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('reads the audit trail merkle root and latest events', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'droidswarm-dashboard-audit-'));
    const dbPath = path.join(workspace, 'data', 'droidswarm.db');
    const originalDbPath = process.env.DROIDSWARM_DB_PATH;
    const originalProjectId = process.env.DROIDSWARM_PROJECT_ID;
    const originalSwarmId = process.env.DROIDSWARM_SWARM_ID;

    process.env.DROIDSWARM_DB_PATH = dbPath;
    process.env.DROIDSWARM_PROJECT_ID = 'audit-project';
    process.env.DROIDSWARM_SWARM_ID = 'audit-swarm';

    const { openPersistenceDatabase } = await import('../../../orchestrator/src/persistence/database.ts');
    const database = openPersistenceDatabase(dbPath);
    try {
      const sharedTracing = await import('../../../../packages/shared-tracing/src/index.ts');
      sharedTracing.appendAuditEvent('TASK_HANDOFF', {
        runId: 'run-audit',
        taskId: 'task-audit',
        detail: 'handoff created',
      }, 'node-audit', { dbPath });

      const dashboardDb = await import(`./db.ts?audit-trail=${Date.now()}`);
      const auditTrail = dashboardDb.getAuditTrail('run-audit');

      assert.notEqual(auditTrail.merkleRoot, 'empty');
      assert.equal(auditTrail.chainVerified, true);
      assert.equal(auditTrail.latestEvents[0]?.eventType, 'TASK_HANDOFF');
      assert.equal(auditTrail.latestEvents[0]?.taskId, 'task-audit');
      dashboardDb.resetDatabaseInstance();
    } finally {
      database.close();
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
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
