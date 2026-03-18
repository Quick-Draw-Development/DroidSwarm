export type OperatorIntent =
  | { category: 'note'; raw: string; referencedTaskId?: string }
  | { category: 'command'; action: OperatorControlAction; referencedTaskId?: string }
  | { category: 'command_error'; message: string; referencedTaskId?: string };

export interface OperatorControlAction {
  type: 'cancel_task' | 'request_review' | 'reprioritize';
  taskId?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  reason?: string;
}

const PRIORITY_LEVELS: OperatorControlAction['priority'][] = ['low', 'medium', 'high', 'urgent'];
const FALLBACK_COMMAND_HELP = 'Usage: /cancel <task-id> [reason], /review <task-id> [reason], /priority <task-id> <level> [reason].';

const sanitizeReason = (tokens: string[]): string | undefined => {
  const content = tokens.join(' ').trim();
  return content.length > 0 ? content : undefined;
};

export const parseOperatorIntent = (text: string, taskId?: string): OperatorIntent => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/') || trimmed.length === 1) {
    return {
      category: 'note',
      raw: text,
      referencedTaskId: taskId,
    };
  }

  const commandBody = trimmed.slice(1).trim();
  if (!commandBody) {
    return {
      category: 'command_error',
      referencedTaskId: taskId,
      message: `Command not recognized. ${FALLBACK_COMMAND_HELP}`,
    };
  }

  const segments = commandBody.split(/\s+/);
  const command = segments[0].toLowerCase();
  const args = segments.slice(1);
  const fallbackTaskId = taskId;

  const targetTaskId = args[0] ?? fallbackTaskId;

  switch (command) {
    case 'cancel': {
      if (!targetTaskId) {
        return {
          category: 'command_error',
          referencedTaskId: fallbackTaskId,
          message: `Missing task identifier. ${FALLBACK_COMMAND_HELP}`,
        };
      }
      const reason = sanitizeReason(args.slice(1));
      return {
        category: 'command',
        referencedTaskId: targetTaskId,
        action: {
          type: 'cancel_task',
          taskId: targetTaskId,
          reason,
        },
      };
    }
    case 'review': {
      if (!targetTaskId) {
        return {
          category: 'command_error',
          referencedTaskId: fallbackTaskId,
          message: `Missing task identifier. ${FALLBACK_COMMAND_HELP}`,
        };
      }
      const reason = sanitizeReason(args.slice(1));
      return {
        category: 'command',
        referencedTaskId: targetTaskId,
        action: {
          type: 'request_review',
          taskId: targetTaskId,
          reason,
        },
      };
    }
    case 'priority': {
      if (!targetTaskId) {
        return {
          category: 'command_error',
          referencedTaskId: fallbackTaskId,
          message: `Missing task identifier. ${FALLBACK_COMMAND_HELP}`,
        };
      }
      const priorityCandidate = args[1];
      if (!priorityCandidate) {
        return {
          category: 'command_error',
          referencedTaskId: targetTaskId,
          message: `Missing priority level. ${FALLBACK_COMMAND_HELP}`,
        };
      }
      const normalizedPriority = priorityCandidate.toLowerCase();
      if (!PRIORITY_LEVELS.includes(normalizedPriority as OperatorControlAction['priority'])) {
        return {
          category: 'command_error',
          referencedTaskId: targetTaskId,
          message: `Priority must be one of ${PRIORITY_LEVELS.join(', ')}.`,
        };
      }
      const reason = sanitizeReason(args.slice(2));
      return {
        category: 'command',
        referencedTaskId: targetTaskId,
        action: {
          type: 'reprioritize',
          taskId: targetTaskId,
          priority: normalizedPriority as OperatorControlAction['priority'],
          reason,
        },
      };
    }
    default: {
      return {
        category: 'command_error',
        referencedTaskId: fallbackTaskId,
        message: `Unknown command "/${command}". ${FALLBACK_COMMAND_HELP}`,
      };
    }
  }
};
