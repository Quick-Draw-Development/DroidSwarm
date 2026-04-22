import { RoutingService as SharedRoutingService } from '@shared-routing';
import type { OrchestratorConfig, PersistedTask, RoutingDecision, TaskPolicy } from '../types';

export class RoutingService {
  private readonly routing = new SharedRoutingService();

  constructor(
    private readonly config: Pick<OrchestratorConfig, 'routingPolicy' | 'modelRouting'>,
  ) {}

  decide(task: PersistedTask, role: string, policy?: TaskPolicy): RoutingDecision {
    const normalizedRole = role.toLowerCase();
    const readOnlyByRole =
      normalizedRole.includes('plan') ||
      normalizedRole.includes('research') ||
      normalizedRole.includes('checkpoint') ||
      normalizedRole.includes('compress') ||
      normalizedRole.includes('review') ||
      normalizedRole.includes('tester') ||
      normalizedRole.includes('critic');
    const decision = this.routing.decide({
      role,
      taskType: typeof task.metadata?.task_type === 'string' ? task.metadata.task_type : undefined,
      stage: typeof task.metadata?.stage === 'string' ? task.metadata.stage : undefined,
      summary: typeof task.metadata?.description === 'string' ? task.metadata.description : undefined,
      readOnly: typeof task.metadata?.read_only === 'boolean' ? task.metadata.read_only : readOnlyByRole,
      allowCloud: policy?.cloudEscalationAllowed
        ?? (typeof task.metadata?.allow_cloud === 'boolean' ? task.metadata.allow_cloud : false),
      queueDepth: typeof task.metadata?.queue_depth === 'number' ? task.metadata.queue_depth : 0,
      fallbackCount: typeof task.metadata?.fallback_count === 'number' ? task.metadata.fallback_count : 0,
      localQueueTolerance: policy?.localQueueTolerance,
      priorityBias: policy?.priorityBias,
      planningHints: this.config.routingPolicy.plannerRoles,
      appleRoles: this.config.routingPolicy.appleRoles,
      appleHints: this.config.routingPolicy.appleTaskHints,
      codeHints: this.config.routingPolicy.codeHints,
      cloudEscalationHints: this.config.routingPolicy.cloudEscalationHints,
    });
    if (decision.engine === 'apple-intelligence') {
      return {
        ...decision,
        model: this.config.modelRouting.apple,
      };
    }
    return decision;
  }
}
