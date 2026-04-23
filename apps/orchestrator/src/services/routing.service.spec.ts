import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getSwarmRoleDefinition, normalizeSwarmRole } from '@shared-routing';
import { RoutingService } from './routing.service';

const service = new RoutingService({
  modelRouting: {
    planning: 'llama.cpp/planner',
    verification: 'llama.cpp/verifier',
    code: 'codex-cli/coder',
    apple: 'apple-intelligence/local',
    default: 'llama.cpp/default',
  },
  appleIntelligence: {
    enabled: true,
    sdkAvailable: true,
  },
  routingPolicy: {
    plannerRoles: ['plan', 'planner', 'research', 'review', 'orchestrator', 'checkpoint', 'compress'],
    appleRoles: ['apple', 'ios', 'macos', 'swift', 'swiftui', 'xcode', 'visionos'],
    appleTaskHints: ['apple', 'ios', 'ipad', 'iphone', 'macos', 'osx', 'swift', 'swiftui', 'objective-c', 'uikit', 'appkit', 'xcode', 'testflight', 'visionos', 'watchos', 'tvos'],
    codeHints: ['code', 'coder', 'dev', 'implementation', 'debug', 'refactor'],
    cloudEscalationHints: ['refactor', 'debug', 'multi-file', 'migration', 'large-scale'],
  },
});

describe('RoutingService', () => {
  it('normalizes existing runtime role aliases into the shared role catalog', () => {
    assert.equal(normalizeSwarmRole('coder-backend'), 'implementation-helper');
    assert.equal(normalizeSwarmRole('tester'), 'verifier');
    assert.equal(normalizeSwarmRole('review'), 'reviewer');
    assert.equal(getSwarmRoleDefinition('repo-scanner').allowParallelInstances, true);
    assert.equal(getSwarmRoleDefinition('arbiter').verificationRequired, false);
  });

  it('routes Apple ecosystem work to the first-class local Apple engine', () => {
    const decision = service.decide({
      taskId: 'task-apple',
      runId: 'run-1',
      name: 'iOS integration',
      status: 'queued',
      priority: 'high',
      metadata: {
        task_type: 'implementation',
        description: 'Update the SwiftUI iOS app and Xcode project settings.',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'coder-ios');

    assert.equal(decision.engine, 'apple-intelligence');
    assert.equal(decision.modelTier, 'local-capable');
    assert.equal(decision.model, 'apple-intelligence/local');
  });

  it('falls back to standard local code routing when Apple Intelligence is unavailable', () => {
    const unavailableService = new RoutingService({
      modelRouting: {
        planning: 'llama.cpp/planner',
        verification: 'llama.cpp/verifier',
        code: 'codex-cli/coder',
        apple: 'apple-intelligence/local',
        default: 'llama.cpp/default',
      },
      appleIntelligence: {
        enabled: false,
        sdkAvailable: false,
      },
      routingPolicy: {
        plannerRoles: ['plan', 'planner', 'research', 'review', 'orchestrator', 'checkpoint', 'compress'],
        appleRoles: ['apple', 'ios', 'macos', 'swift', 'swiftui', 'xcode', 'visionos'],
        appleTaskHints: ['apple', 'ios', 'ipad', 'iphone', 'macos', 'osx', 'swift', 'swiftui', 'objective-c', 'uikit', 'appkit', 'xcode', 'testflight', 'visionos', 'watchos', 'tvos'],
        codeHints: ['code', 'coder', 'dev', 'implementation', 'debug', 'refactor'],
        cloudEscalationHints: ['refactor', 'debug', 'multi-file', 'migration', 'large-scale'],
      },
    });

    const decision = unavailableService.decide({
      taskId: 'task-apple-fallback',
      runId: 'run-1',
      name: 'iOS integration',
      status: 'queued',
      priority: 'high',
      metadata: {
        task_type: 'implementation',
        description: 'Update the SwiftUI iOS app and Xcode project settings.',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'coder-ios');

    assert.equal(decision.engine, 'codex-cli');
    assert.equal(decision.model, 'codex-cli/coder');
    assert.match(decision.reason, /Apple Intelligence unavailable/);
    assert.equal(decision.cloudEscalated, false);
  });

  it('keeps cloud escalation explicit for non-Apple coding work', () => {
    const decision = service.decide({
      taskId: 'task-cloud',
      runId: 'run-1',
      name: 'big refactor',
      status: 'queued',
      priority: 'high',
      metadata: {
        task_type: 'implementation',
        description: 'Large-scale multi-file refactor across backend services.',
        allow_cloud: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'coder-backend');

    assert.equal(decision.engine, 'codex-cloud');
    assert.equal(decision.modelTier, 'cloud');
  });

  it('uses canonical local-first defaults for arbiter and verifier roles', () => {
    const arbiterDecision = service.decide({
      taskId: 'task-arbiter',
      runId: 'run-1',
      name: 'Compare specialist outputs',
      status: 'queued',
      priority: 'medium',
      metadata: {
        task_type: 'comparison',
        description: 'Resolve disagreement between two reviewers.',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'arbiter');

    const verifierDecision = service.decide({
      taskId: 'task-verifier',
      runId: 'run-1',
      name: 'Verify implementation',
      status: 'queued',
      priority: 'medium',
      metadata: {
        task_type: 'verification',
        description: 'Run verification after implementation.',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'tester');

    assert.equal(arbiterDecision.engine, 'local-llama');
    assert.equal(arbiterDecision.modelTier, 'local-cheap');
    assert.equal(verifierDecision.engine, 'local-llama');
    assert.equal(verifierDecision.modelTier, 'local-cheap');
  });

  it('keeps planning and compression roles local when llama capacity is saturated', () => {
    const decision = service.decide({
      taskId: 'task-saturated-planner',
      runId: 'run-1',
      name: 'Plan under local pressure',
      status: 'queued',
      priority: 'medium',
      metadata: {
        task_type: 'plan',
        description: 'Need planner output while local queue is busy.',
        queue_depth: 7,
        fallback_count: 2,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'checkpoint-compressor');

    assert.equal(decision.engine, 'local-llama');
    assert.equal(decision.routeKind, 'planner-local-saturated');
    assert.equal(decision.cloudEscalated, false);
  });

  it('escalates coding work to cloud only when cloud is allowed and local capacity is saturated', () => {
    const decision = service.decide({
      taskId: 'task-saturated-coder',
      runId: 'run-1',
      name: 'Queued coding task',
      status: 'queued',
      priority: 'high',
      metadata: {
        task_type: 'implementation',
        description: 'Implement a multi-file feature while local queue is saturated.',
        allow_cloud: true,
        queue_depth: 6,
        fallback_count: 2,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'coder-backend');

    assert.equal(decision.engine, 'codex-cloud');
    assert.equal(decision.routeKind, 'cloud-escalated-from-local-saturation');
    assert.equal(decision.escalationReason, 'local_saturated_and_cloud_allowed');
  });

  it('uses task policy queue tolerance and time bias for cloud escalation', () => {
    const decision = service.decide({
      taskId: 'task-time-priority',
      runId: 'run-1',
      name: 'Urgent coding task',
      status: 'queued',
      priority: 'high',
      metadata: {
        task_type: 'implementation',
        description: 'Multi-file implementation with urgent delivery expectations.',
        queue_depth: 2,
        fallback_count: 1,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'coder-backend', {
      localQueueTolerance: 2,
      cloudEscalationAllowed: true,
      priorityBias: 'time',
    });

    assert.equal(decision.engine, 'codex-cloud');
    assert.equal(decision.routeKind, 'cloud-escalated-from-local-saturation');
  });

  it('keeps coding work local when policy disables cloud escalation', () => {
    const decision = service.decide({
      taskId: 'task-local-only',
      runId: 'run-1',
      name: 'Local only coding task',
      status: 'queued',
      priority: 'high',
      metadata: {
        task_type: 'implementation',
        description: 'Large-scale refactor but must remain local.',
        allow_cloud: true,
        queue_depth: 8,
        fallback_count: 2,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'coder-backend', {
      cloudEscalationAllowed: false,
      priorityBias: 'cost',
      localQueueTolerance: 3,
    });

    assert.notEqual(decision.engine, 'codex-cloud');
    assert.equal(decision.cloudEscalated, false);
  });
});
