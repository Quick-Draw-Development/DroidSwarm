import { RoutingService as SharedRoutingService } from '@shared-routing';
import { selectModelForRole } from '@model-router';
import { runConsensusRound } from '@shared-governance';
import { appendAuditEvent } from '@shared-tracing';
import type { OrchestratorConfig, PersistedTask, RoutingDecision, TaskPolicy } from '../types';

export class RoutingService {
  private readonly routing = new SharedRoutingService();

  constructor(
    private readonly config: Pick<OrchestratorConfig, 'routingPolicy' | 'modelRouting' | 'appleIntelligence' | 'mlx'>,
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
      appleEnabled: this.config.appleIntelligence?.enabled ?? true,
      preferAppleIntelligence: this.config.appleIntelligence?.preferredByHost,
      platform: process.platform,
      arch: process.arch,
      mlxAvailable: this.config.mlx?.available ?? false,
      planningHints: this.config.routingPolicy.plannerRoles,
      appleRoles: this.config.routingPolicy.appleRoles,
      appleHints: this.config.routingPolicy.appleTaskHints,
      codeHints: this.config.routingPolicy.codeHints,
      cloudEscalationHints: this.config.routingPolicy.cloudEscalationHints,
    });
    const modelSelection = selectModelForRole({
      role,
      useCase: typeof task.metadata?.task_type === 'string' ? task.metadata.task_type : undefined,
      taskType: typeof task.metadata?.task_type === 'string' ? task.metadata.task_type : undefined,
      stage: typeof task.metadata?.stage === 'string' ? task.metadata.stage : undefined,
      summary: typeof task.metadata?.description === 'string' ? task.metadata.description : undefined,
      contextLength: typeof task.metadata?.context_length === 'number' ? task.metadata.context_length : undefined,
      preferAppleIntelligence: this.config.appleIntelligence?.preferredByHost,
      appleRuntimeAvailable: this.config.appleIntelligence?.enabled ?? true,
      mlxAvailable: this.config.mlx?.available ?? false,
    });
    if (modelSelection.model) {
      const previousModel = typeof task.metadata?.agent_model === 'string' ? task.metadata.agent_model : undefined;
      const normalizedRole = role.toLowerCase();
      const isCriticalRole = normalizedRole.includes('planner')
        || normalizedRole.includes('guardian')
        || normalizedRole.includes('review');
      try {
        if (isCriticalRole && previousModel && previousModel !== modelSelection.model.displayName) {
          runConsensusRound({
            proposalType: 'human-override',
            title: `Model reassignment for ${role}`,
            summary: `Switching ${role} from ${previousModel} to ${modelSelection.model.displayName}.`,
            glyph: 'EVT-MODEL-SELECTED',
            context: {
              eventType: 'model.routing',
              actorRole: 'orchestrator',
              swarmRole: 'master',
              projectId: task.projectId,
              auditLoggingEnabled: true,
              dashboardEnabled: false,
            },
          });
        }
        appendAuditEvent('EVT-MODEL-SELECTED', {
          taskId: task.taskId,
          role,
          backend: modelSelection.backend,
          modelId: modelSelection.model.modelId,
          displayName: modelSelection.model.displayName,
          reasoningDepth: modelSelection.model.reasoningDepth,
          speedTier: modelSelection.model.speedTier,
        });
      } catch {
        // Routing must remain usable in tests and read-only contexts without audit storage.
      }
    }
    if (decision.engine === 'apple-intelligence') {
      return {
        ...decision,
        model: modelSelection.model?.displayName ?? this.config.modelRouting.apple,
      };
    }
    if (decision.engine === 'mlx') {
      return {
        ...decision,
        model: modelSelection.model?.displayName ?? this.config.modelRouting.mlx ?? 'mlx/local',
      };
    }
    if (decision.engine === 'local-llama') {
      return {
        ...decision,
        model: modelSelection.model?.path ?? modelSelection.model?.displayName ?? this.config.modelRouting.default,
      };
    }
    return {
      ...decision,
      ...(modelSelection.model ? { model: modelSelection.model.displayName } : {}),
    };
  }
}
