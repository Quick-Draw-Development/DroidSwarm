import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openPersistenceDatabase } from './database';
import { PersistenceClient } from './repositories';
import { OrchestratorPersistenceService } from './service';
import { PersistedTask, TaskAttemptRecord } from '../types';

const nowIso = (): string => new Date().toISOString();

describe('Orchestrator persistence repositories', () => {
  it('creates and reads runs, tasks, and artifacts reliably', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);

    const run = persistence.createRun('droidswarm');
    assert.equal(run.projectId, 'droidswarm');

    const task: PersistedTask = {
      taskId: 'task-1',
      runId: run.runId,
      name: 'phase-one',
      status: 'queued',
      priority: 'medium',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.tasks.create(task);

    const tasks = persistence.tasks.listByRun(run.runId);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].name, 'phase-one');

    const attempt: TaskAttemptRecord = {
      attemptId: 'attempt-1',
      taskId: task.taskId,
      runId: run.runId,
      agentName: 'Planner-01',
      status: 'running',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.attempts.create(attempt);

    const artifact = {
      artifactId: 'artifact-1',
      attemptId: attempt.attemptId,
      taskId: task.taskId,
      runId: run.runId,
      kind: 'summary',
      summary: 'planned architecture',
      content: 'Detailed plan',
      createdAt: nowIso(),
    };
    persistence.artifacts.create(artifact);

    const artifacts = persistence.artifacts.listByTask(task.taskId);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].summary, 'planned architecture');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('tracks dependencies and allows attempt status transitions', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);

    const run = persistence.createRun('droidswarm');
    const parent: PersistedTask = {
      taskId: 'parent',
      runId: run.runId,
      name: 'parent-task',
      status: 'queued',
      priority: 'high',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const child: PersistedTask = {
      taskId: 'child',
      runId: run.runId,
      parentTaskId: parent.taskId,
      name: 'child-task',
      status: 'queued',
      priority: 'high',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.tasks.create(parent);
    persistence.tasks.create(child);

    persistence.dependencies.add({
      dependencyId: randomUUID(),
      taskId: child.taskId,
      dependsOnTaskId: parent.taskId,
      createdAt: nowIso(),
    });

    const dependencies = persistence.dependencies.listDependencies(child.taskId);
    const dependents = persistence.dependencies.listDependents(parent.taskId);
    assert.equal(dependencies.length, 1);
    assert.equal(dependents.length, 1);
    assert.equal(dependencies[0].dependsOnTaskId, parent.taskId);

    const attempt: TaskAttemptRecord = {
      attemptId: 'attempt-2',
      taskId: parent.taskId,
      runId: run.runId,
      agentName: 'Planner-01',
      status: 'running',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.attempts.create(attempt);
    persistence.attempts.updateStatus(attempt.attemptId, 'completed');

    const updated = persistence.attempts.getById(attempt.attemptId);
    assert.equal(updated?.status, 'completed');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores artifacts and checkpoints via the persistence service', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const task: PersistedTask = {
      taskId: 'task-checkpoint',
      runId: run.runId,
      name: 'checkpoint-task',
      status: 'queued',
      priority: 'high',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.tasks.create(task);

    const attempt: TaskAttemptRecord = {
      attemptId: 'attempt-checkpoint',
      taskId: task.taskId,
      runId: task.runId,
      agentName: 'Agent-01',
      status: 'running',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.attempts.create(attempt);

    const checkpointPayload = { summary: 'progress saved', compression: { compressed_content: 'droidspeak-v1' } };
    const checkpointId = service.recordCheckpoint(task.taskId, attempt.attemptId, checkpointPayload);
    const latestCheckpoint = service.getLatestCheckpoint(task.taskId);

    assert.equal(typeof checkpointId, 'string');
    assert.equal(latestCheckpoint?.attemptId, attempt.attemptId);
    assert.equal(JSON.parse(latestCheckpoint?.payloadJson ?? '{}').summary, 'progress saved');

    service.recordArtifact({
      artifactId: 'artifact-checkpoint',
      attemptId: attempt.attemptId,
      taskId: task.taskId,
      kind: 'checkpoint',
      summary: 'checkpoint artifact',
      content: 'details',
      metadata: { source: 'test' },
      createdAt: nowIso(),
    });

    const artifacts = service.getArtifactsForTask(task.taskId);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].metadata?.source, 'test');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('records budget events when thresholds fire', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    service.createTask({
      taskId: 'task-limit',
      name: 'budget-guard',
      priority: 'low',
      metadata: {
        description: 'placeholder for budget events',
      },
    });

    service.recordBudgetEvent('task-limit', 'test limit hit', 1);

    const events = persistence.budgets.listByTask('task-limit');
    assert.equal(events.length, 1);
    assert.equal(events[0].detail, 'test limit hit');
    assert.equal(events[0].consumed, 1);

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists operator control actions', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    service.createTask({
      taskId: 'task-operator',
      name: 'operator-placeholder',
      priority: 'medium',
      metadata: {
        description: 'placeholder for operator actions',
      },
    });

    service.recordOperatorAction({
      taskId: 'task-operator',
      actionType: 'cancel_task',
      detail: 'operator requested cancel',
      metadata: { reason: 'urgent' },
    });

    const stored = persistence.actions.listByTask('task-operator')[0];
    assert.equal(stored?.actionType, 'cancel_task');
    assert.equal(stored?.detail, 'operator requested cancel');
    assert.equal(JSON.parse(stored?.metadataJson ?? '{}').reason, 'urgent');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('records verification outcomes for tasks', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const task: PersistedTask = {
      taskId: 'task-verification',
      runId: run.runId,
      name: 'verify-task',
      status: 'queued',
      priority: 'high',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    persistence.tasks.create(task);

    service.recordVerificationOutcome({
      taskId: task.taskId,
      stage: 'verification',
      status: 'passed',
      summary: 'tests passed',
      reviewer: 'Tester',
      details: 'all good',
    });

    const stored = persistence.verifications.listByTask(task.taskId)[0];
    assert.equal(stored?.status, 'passed');
    assert.equal(stored?.reviewer, 'Tester');
    assert.equal(stored?.details, 'all good');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores task state digests and handoff packets', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'droidswarm-persistence-'));
    const dbPath = path.join(tempDir, 'state.db');
    const db = openPersistenceDatabase(dbPath);
    const persistence = PersistenceClient.fromDatabase(db);
    const run = persistence.createRun('droidswarm');
    const service = new OrchestratorPersistenceService(persistence, run);

    const task = service.createTask({
      taskId: 'task-digest',
      name: 'digest-task',
      priority: 'medium',
      metadata: {
        description: 'digest coverage',
      },
    });

    service.recordTaskStateDigest({
      id: 'digest-1',
      taskId: task.taskId,
      runId: run.runId,
      projectId: 'droidswarm',
      objective: 'digest-task',
      currentPlan: ['plan'],
      decisions: ['decision'],
      openQuestions: [],
      activeRisks: [],
      artifactIndex: [],
      verificationState: 'queued',
      lastUpdatedBy: 'orch',
      ts: nowIso(),
      droidspeak: {
        kind: 'summary_emitted',
        compact: 'summary:emitted',
        expanded: 'Summary emitted.',
      },
    });

    const digest = service.getLatestTaskStateDigest(task.taskId);
    assert.equal(digest?.id, 'digest-1');
    assert.equal(service.listTaskStateDigests(task.taskId).length, 1);

    service.recordArtifactMemory({
      id: 'artifact-memory-1',
      taskId: task.taskId,
      runId: run.runId,
      projectId: 'droidswarm',
      artifactId: 'artifact-1',
      kind: 'summary',
      shortSummary: 'Artifact summary',
      reasonRelevant: 'This artifact captures the latest implementation constraints.',
      trustConfidence: 0.88,
      sourceTaskId: task.taskId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    const artifactMemory = service.listArtifactMemory(task.taskId);
    assert.equal(artifactMemory.length, 1);
    assert.equal(artifactMemory[0]?.artifactId, 'artifact-1');
    assert.equal(artifactMemory[0]?.reasonRelevant, 'This artifact captures the latest implementation constraints.');

    service.recordHandoffPacket({
      id: 'handoff-1',
      taskId: task.taskId,
      runId: run.runId,
      projectId: 'droidswarm',
      fromTaskId: task.taskId,
      toRole: 'coder',
      digestId: 'digest-1',
      requiredReads: ['artifact-1'],
      summary: 'handoff ready',
      ts: nowIso(),
      droidspeak: {
        kind: 'handoff_ready',
        compact: 'handoff:ready',
        expanded: 'Handoff ready.',
      },
    });

    const handoffs = service.listHandoffPackets(task.taskId);
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].digestId, 'digest-1');
    assert.equal(service.getLatestHandoffPacket(task.taskId, run.runId)?.id, 'handoff-1');

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
