import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RoutingService } from './routing.service';

const service = new RoutingService({
  modelRouting: {
    planning: 'llama.cpp/planner',
    verification: 'llama.cpp/verifier',
    code: 'codex-cli/coder',
    apple: 'apple-intelligence/local',
    default: 'llama.cpp/default',
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
});
