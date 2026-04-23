import type { RoutingDecision } from '@shared-types';
import { tracer } from '@shared-tracing';
import { getSwarmRoleDefinition } from './role-catalog';

export type { SwarmRole, SwarmRoleDefinition } from './role-catalog';
export { getSwarmRoleDefinition, listSwarmRoleDefinitions, normalizeSwarmRole } from './role-catalog';

export interface RoutingContext {
  role: string;
  taskType?: string;
  stage?: string;
  summary?: string;
  readOnly?: boolean;
  allowCloud?: boolean;
  queueDepth?: number;
  fallbackCount?: number;
  localQueueTolerance?: number;
  priorityBias?: 'time' | 'cost' | 'balanced';
  planningHints?: string[];
  appleHints?: string[];
  appleRoles?: string[];
  appleEnabled?: boolean;
  codeHints?: string[];
  cloudEscalationHints?: string[];
}

const defaultCodeHints = ['code', 'coder', 'dev', 'implementation', 'debug', 'refactor'];
const defaultPlanningHints = ['plan', 'planner', 'research', 'review', 'orchestrator', 'checkpoint', 'compress'];
const defaultAppleRoles = ['apple', 'ios', 'macos', 'swift', 'swiftui', 'xcode', 'visionos'];
const defaultAppleHints = ['apple', 'ios', 'ipad', 'iphone', 'macos', 'osx', 'swift', 'swiftui', 'objective-c', 'uikit', 'appkit', 'xcode', 'testflight', 'visionos', 'watchos', 'tvos'];
const defaultCloudEscalationHints = ['refactor', 'debug', 'multi-file', 'migration', 'large-scale'];

export class RoutingService {
  decide(context: RoutingContext): RoutingDecision {
    const role = context.role.toLowerCase();
    const roleDefinition = getSwarmRoleDefinition(context.role);
    const taskType = context.taskType?.toLowerCase() ?? '';
    const stage = context.stage?.toLowerCase() ?? '';
    const planningHints = context.planningHints ?? defaultPlanningHints;
    const appleRoles = context.appleRoles ?? defaultAppleRoles;
    const appleHints = context.appleHints ?? defaultAppleHints;
    const appleEnabled = context.appleEnabled ?? true;
    const codeHints = context.codeHints ?? defaultCodeHints;
    const cloudEscalationHints = context.cloudEscalationHints ?? defaultCloudEscalationHints;
    const complexity = this.inferComplexity(role, taskType, context.summary, codeHints, cloudEscalationHints);
    const readOnly = context.readOnly ?? (stage === 'review' || stage === 'verification');
    const queueDepth = context.queueDepth ?? 0;
    const fallbackCount = context.fallbackCount ?? 0;
    const localQueueTolerance = Math.max(1, context.localQueueTolerance ?? 4);
    const priorityBias = context.priorityBias ?? 'balanced';
    const localFirst = true;
    const localSaturated = queueDepth >= localQueueTolerance || fallbackCount >= 2;
    const combined = `${role} ${taskType} ${context.summary ?? ''}`.toLowerCase();
    const appleMatched =
      roleDefinition.id === 'apple-specialist'
      || appleRoles.some((hint) => role.includes(hint))
      || appleHints.some((hint) => combined.includes(hint));
    const withAppleFallbackReason = (reason: string): string =>
      appleMatched && !appleEnabled
        ? `Apple Intelligence unavailable; fell back to standard local-first routing. ${reason}`
        : reason;

    if (appleMatched && appleEnabled) {
      return this.auditDecision(context, {
        engine: 'apple-intelligence',
        model: 'apple-intelligence/local',
        modelTier: roleDefinition.defaultModelTier,
        routeKind: localSaturated ? 'apple-local-saturated' : 'apple-local',
        reason: localSaturated
          ? 'Apple-local route retained despite local saturation because Apple-specialist work stays local-first'
          : 'First-class local Apple Intelligence rule matched Apple ecosystem task scope',
        role: context.role,
        readOnly,
        complexity,
        confidence: 0.9,
        skillPacks: this.defaultSkillPacks(context.role),
        queueDepth,
        fallbackCount,
        localFirst,
        cloudEscalated: false,
      });
    }

    if (
      roleDefinition.id === 'planner'
      || roleDefinition.id === 'researcher'
      || roleDefinition.id === 'reviewer'
      || roleDefinition.id === 'verifier'
      || roleDefinition.id === 'summarizer'
      || roleDefinition.id === 'checkpoint-compressor'
      || roleDefinition.id === 'arbiter'
      || stage === 'verification'
        || stage === 'review'
        || planningHints.some((hint) => role.includes(hint))
    ) {
      return this.auditDecision(context, {
        engine: 'local-llama',
        model: 'llama.cpp/planner',
        modelTier: roleDefinition.defaultModelTier,
        routeKind: localSaturated ? 'planner-local-saturated' : 'planner-local',
        reason: withAppleFallbackReason(localSaturated
          ? 'Local-first planning, review, and compression roles stay local even when llama capacity is saturated'
          : 'Local-first planning, review, and orchestration policy'),
        role: context.role,
        readOnly,
        complexity,
        confidence: 0.84,
        skillPacks: this.defaultSkillPacks(context.role),
        queueDepth,
        fallbackCount,
        localFirst,
        cloudEscalated: false,
      });
    }

    if (
      roleDefinition.id === 'implementation-helper'
      || roleDefinition.id === 'bugfix-helper'
      || codeHints.some((hint) => role.includes(hint) || taskType.includes(hint))
    ) {
      const shouldEscalate = context.allowCloud === true && (
        complexity === 'high'
        || (localSaturated && priorityBias !== 'cost')
        || (priorityBias === 'time' && complexity === 'medium')
      );
      return this.auditDecision(context, {
        engine: shouldEscalate ? 'codex-cloud' : 'codex-cli',
        model: shouldEscalate ? 'codex-cloud/coder' : 'codex-cli/coder',
        modelTier: shouldEscalate ? 'cloud' : roleDefinition.defaultModelTier,
        routeKind: shouldEscalate
          ? (localSaturated ? 'cloud-escalated-from-local-saturation' : 'cloud-escalated')
          : (localSaturated ? 'coder-local-queued' : 'coder-local'),
        escalationReason: shouldEscalate
          ? (localSaturated ? 'local_saturated_and_cloud_allowed' : 'explicit_cloud_policy_with_high_complexity')
          : (localSaturated ? 'local_queue_retained_due_to_local_first' : undefined),
        reason: withAppleFallbackReason(shouldEscalate
          ? (localSaturated
            ? 'Cloud escalation allowed because local-first coding capacity is saturated'
            : 'Explicit cloud escalation approved after local-first complexity check')
          : (localSaturated
            ? 'Local-first coding helper retained locally and should queue until capacity clears'
            : 'Local-first coding helper selected by default')),
        role: context.role,
        readOnly,
        complexity,
        confidence: shouldEscalate ? 0.79 : 0.72,
        skillPacks: this.defaultSkillPacks(context.role),
        queueDepth,
        fallbackCount,
        localFirst,
        cloudEscalated: shouldEscalate,
      });
    }

    return this.auditDecision(context, {
      engine: 'local-llama',
      model: 'llama.cpp/default',
      modelTier: roleDefinition.defaultModelTier,
      routeKind: localSaturated ? 'default-local-saturated' : 'default-local',
      reason: withAppleFallbackReason(localSaturated
        ? 'Default local-first execution retained locally while the local tier is saturated'
        : 'Default local-first execution policy'),
      role: context.role,
      readOnly,
      complexity,
      confidence: 0.75,
      skillPacks: this.defaultSkillPacks(context.role),
      queueDepth,
      fallbackCount,
      localFirst,
      cloudEscalated: false,
    });
  }

  private auditDecision(context: RoutingContext, decision: RoutingDecision): RoutingDecision {
    tracer.audit('ROUTING_DECISION', {
      role: context.role,
      taskType: context.taskType,
      stage: context.stage,
      queueDepth: context.queueDepth,
      fallbackCount: context.fallbackCount,
      allowCloud: context.allowCloud,
      priorityBias: context.priorityBias,
      appleEnabled: context.appleEnabled,
      engine: decision.engine,
      model: decision.model,
      modelTier: decision.modelTier,
      routeKind: decision.routeKind,
      escalationReason: decision.escalationReason,
      complexity: decision.complexity,
      localFirst: decision.localFirst,
      cloudEscalated: decision.cloudEscalated,
    });
    return decision;
  }

  private inferComplexity(
    role: string,
    taskType: string,
    summary: string | undefined,
    codeHints: string[],
    cloudEscalationHints: string[],
  ): RoutingDecision['complexity'] {
    const combined = `${role} ${taskType} ${summary ?? ''}`.toLowerCase();
    if (cloudEscalationHints.some((hint) => combined.includes(hint))) {
      return 'high';
    }
    if (codeHints.some((hint) => combined.includes(hint))) {
      return 'medium';
    }
    return 'low';
  }

  private defaultSkillPacks(role: string): string[] {
    const normalized = getSwarmRoleDefinition(role).id;
    if (normalized === 'planner') {
      return ['planner'];
    }
    if (normalized === 'reviewer' || normalized === 'arbiter') {
      return ['reviewer'];
    }
    if (normalized === 'researcher' || normalized === 'repo-scanner') {
      return ['researcher'];
    }
    if (normalized === 'bugfix-helper') {
      return ['bugfix'];
    }
    if (normalized === 'implementation-helper' || normalized === 'apple-specialist') {
      return ['feature'];
    }
    if (normalized === 'summarizer' || normalized === 'checkpoint-compressor') {
      return ['planner'];
    }
    return ['orchestrator'];
  }
}
