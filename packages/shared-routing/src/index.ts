import type { RoutingDecision } from '@shared-types';

export interface RoutingContext {
  role: string;
  taskType?: string;
  stage?: string;
  summary?: string;
  readOnly?: boolean;
}

const codeHints = ['code', 'coder', 'dev', 'implementation', 'debug', 'refactor'];
const planningHints = ['plan', 'planner', 'research', 'review', 'orchestrator'];

export class RoutingService {
  decide(context: RoutingContext): RoutingDecision {
    const role = context.role.toLowerCase();
    const taskType = context.taskType?.toLowerCase() ?? '';
    const stage = context.stage?.toLowerCase() ?? '';
    const complexity = this.inferComplexity(role, taskType, context.summary);
    const readOnly = context.readOnly ?? (stage === 'review' || stage === 'verification');

    if (stage === 'verification' || stage === 'review' || planningHints.some((hint) => role.includes(hint))) {
      return {
        engine: 'local-llama',
        model: 'llama.cpp/planner',
        reason: 'Local-first planning, review, and orchestration policy',
        role: context.role,
        readOnly,
        complexity,
        confidence: 0.84,
        skillPacks: this.defaultSkillPacks(context.role),
      };
    }

    if (complexity === 'high' || codeHints.some((hint) => role.includes(hint) || taskType.includes(hint))) {
      return {
        engine: complexity === 'high' ? 'codex-cloud' : 'codex-cli',
        model: complexity === 'high' ? 'codex-cloud/coder' : 'codex-cli/coder',
        reason: complexity === 'high'
          ? 'Escalated to cloud coding for complex multi-file implementation'
          : 'Local coding helper selected for bounded shell-heavy work',
        role: context.role,
        readOnly,
        complexity,
        confidence: complexity === 'high' ? 0.79 : 0.72,
        skillPacks: this.defaultSkillPacks(context.role),
      };
    }

    return {
      engine: 'local-llama',
      model: 'llama.cpp/default',
      reason: 'Default local-first execution policy',
      role: context.role,
      readOnly,
      complexity,
      confidence: 0.75,
      skillPacks: this.defaultSkillPacks(context.role),
    };
  }

  private inferComplexity(role: string, taskType: string, summary?: string): RoutingDecision['complexity'] {
    const combined = `${role} ${taskType} ${summary ?? ''}`.toLowerCase();
    if (combined.includes('refactor') || combined.includes('debug') || combined.includes('multi-file')) {
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
