import type { RoutingDecision } from '@shared-types';

export interface RoutingContext {
  role: string;
  taskType?: string;
  stage?: string;
  summary?: string;
  readOnly?: boolean;
  allowCloud?: boolean;
  queueDepth?: number;
  fallbackCount?: number;
  planningHints?: string[];
  appleHints?: string[];
  appleRoles?: string[];
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
    const taskType = context.taskType?.toLowerCase() ?? '';
    const stage = context.stage?.toLowerCase() ?? '';
    const planningHints = context.planningHints ?? defaultPlanningHints;
    const appleRoles = context.appleRoles ?? defaultAppleRoles;
    const appleHints = context.appleHints ?? defaultAppleHints;
    const codeHints = context.codeHints ?? defaultCodeHints;
    const cloudEscalationHints = context.cloudEscalationHints ?? defaultCloudEscalationHints;
    const complexity = this.inferComplexity(role, taskType, context.summary, codeHints, cloudEscalationHints);
    const readOnly = context.readOnly ?? (stage === 'review' || stage === 'verification');
    const queueDepth = context.queueDepth ?? 0;
    const fallbackCount = context.fallbackCount ?? 0;
    const localFirst = true;
    const combined = `${role} ${taskType} ${context.summary ?? ''}`.toLowerCase();

    if (appleRoles.some((hint) => role.includes(hint)) || appleHints.some((hint) => combined.includes(hint))) {
      return {
        engine: 'apple-intelligence',
        model: 'apple-intelligence/local',
        modelTier: 'local-capable',
        routeKind: 'apple-local',
        reason: 'First-class local Apple Intelligence rule matched Apple ecosystem task scope',
        role: context.role,
        readOnly,
        complexity,
        confidence: 0.9,
        skillPacks: this.defaultSkillPacks(context.role),
        queueDepth,
        fallbackCount,
        localFirst,
        cloudEscalated: false,
      };
    }

    if (stage === 'verification' || stage === 'review' || planningHints.some((hint) => role.includes(hint))) {
      return {
        engine: 'local-llama',
        model: 'llama.cpp/planner',
        modelTier: 'local-cheap',
        routeKind: 'planner-local',
        reason: 'Local-first planning, review, and orchestration policy',
        role: context.role,
        readOnly,
        complexity,
        confidence: 0.84,
        skillPacks: this.defaultSkillPacks(context.role),
        queueDepth,
        fallbackCount,
        localFirst,
        cloudEscalated: false,
      };
    }

    if (codeHints.some((hint) => role.includes(hint) || taskType.includes(hint))) {
      const shouldEscalate = complexity === 'high' && context.allowCloud === true;
      return {
        engine: shouldEscalate ? 'codex-cloud' : 'codex-cli',
        model: shouldEscalate ? 'codex-cloud/coder' : 'codex-cli/coder',
        modelTier: shouldEscalate ? 'cloud' : 'local-capable',
        routeKind: shouldEscalate ? 'cloud-escalated' : 'coder-local',
        escalationReason: shouldEscalate ? 'explicit_cloud_policy_with_high_complexity' : undefined,
        reason: shouldEscalate
          ? 'Explicit cloud escalation approved after local-first complexity check'
          : 'Local-first coding helper selected by default',
        role: context.role,
        readOnly,
        complexity,
        confidence: shouldEscalate ? 0.79 : 0.72,
        skillPacks: this.defaultSkillPacks(context.role),
        queueDepth,
        fallbackCount,
        localFirst,
        cloudEscalated: shouldEscalate,
      };
    }

    return {
      engine: 'local-llama',
      model: 'llama.cpp/default',
      modelTier: 'local-cheap',
      routeKind: 'default-local',
      reason: 'Default local-first execution policy',
      role: context.role,
      readOnly,
      complexity,
      confidence: 0.75,
      skillPacks: this.defaultSkillPacks(context.role),
      queueDepth,
      fallbackCount,
      localFirst,
      cloudEscalated: false,
    };
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
    const normalized = role.toLowerCase();
    if (normalized.includes('plan')) {
      return ['planner'];
    }
    if (normalized.includes('review')) {
      return ['reviewer'];
    }
    if (normalized.includes('research')) {
      return ['researcher'];
    }
    if (normalized.includes('bug')) {
      return ['bugfix'];
    }
    if (normalized.includes('feature') || normalized.includes('code')) {
      return ['feature'];
    }
    return ['orchestrator'];
  }
}
