import type { AgentSupervisor } from '../AgentSupervisor';
import type { PersistedTask } from '../types';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type { OperatorControlAction } from './operator-intents';

export interface OperatorActionOutcome {
  actionType: OperatorControlAction['type'];
  detail: string;
  removedAgents?: string[];
  reviewRequested?: boolean;
  priority?: PersistedTask['priority'];
}

export class OperatorActionService {
  constructor(
    private readonly persistenceService: OrchestratorPersistenceService,
    private readonly supervisor: AgentSupervisor,
  ) {}

  execute(action: OperatorControlAction, taskId: string, operatorName: string, detail: string): OperatorActionOutcome {
    this.persistenceService.recordOperatorAction({
      taskId,
      actionType: action.type,
      detail,
      metadata: {
        operator: operatorName,
        priority: action.priority,
      },
    });

    switch (action.type) {
      case 'cancel_task': {
        const removedAgents = this.supervisor.cancelTask(taskId);
        this.persistenceService.setTaskStatus(taskId, 'cancelled');
        return {
          actionType: action.type,
          detail,
          removedAgents,
        };
      }
      case 'request_review': {
        this.persistenceService.setTaskStatus(taskId, 'in_review');
        return {
          actionType: action.type,
          detail,
          reviewRequested: true,
        };
      }
      case 'reprioritize': {
        if (action.priority) {
          this.persistenceService.updateTaskPriority(taskId, action.priority);
        }
        return {
          actionType: action.type,
          detail,
          priority: action.priority,
        };
      }
    }

    return {
      actionType: action.type,
      detail,
    };
  }

  recordRejectedCommand(taskId: string | undefined, operatorName: string, command: string, reason: string): void {
    this.persistenceService.recordOperatorAction({
      taskId,
      actionType: 'invalid_command',
      detail: reason,
      metadata: {
        operator: operatorName,
        command,
      },
    });
  }
}
