import { RoutingService as SharedRoutingService } from '@shared-routing';
import type { PersistedTask, RoutingDecision } from '../types';

export class RoutingService {
  private readonly routing = new SharedRoutingService();

  decide(task: PersistedTask, role: string): RoutingDecision {
    const normalizedRole = role.toLowerCase();
    const readOnlyByRole =
      normalizedRole.includes('plan') ||
      normalizedRole.includes('research') ||
      normalizedRole.includes('review') ||
      normalizedRole.includes('tester') ||
      normalizedRole.includes('critic');
    return this.routing.decide({
      role,
      taskType: typeof task.metadata?.task_type === 'string' ? task.metadata.task_type : undefined,
      stage: typeof task.metadata?.stage === 'string' ? task.metadata.stage : undefined,
      summary: typeof task.metadata?.description === 'string' ? task.metadata.description : undefined,
      readOnly: typeof task.metadata?.read_only === 'boolean' ? task.metadata.read_only : readOnlyByRole,
    });
  }
}
