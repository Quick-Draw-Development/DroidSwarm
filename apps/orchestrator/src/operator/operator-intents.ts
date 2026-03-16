export type OperatorIntent =
  | { category: 'note'; raw: string; referencedTaskId?: string }
  | { category: 'command'; action: OperatorControlAction; referencedTaskId?: string };

export interface OperatorControlAction {
  type: 'cancel_task' | 'request_review' | 'reprioritize';
  taskId?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  reason?: string;
}

const CANCEL_KEYWORDS = ['cancel', 'stop', 'abort'];
const REVIEW_KEYWORDS = ['review', 'verify', 'inspection', 'approval'];
const REPRIORITIZE_KEYWORDS = ['priority', 'reprioritize', 'urgent', 'urgentize'];

const findTaskId = (text: string, fallback?: string): string | undefined => {
  if (fallback) {
    return fallback;
  }

  const match = text.match(/task\s+([A-Za-z0-9-_]+)/i);
  return match ? match[1] : undefined;
};

const detectPriorityLevel = (text: string): OperatorControlAction['priority'] => {
  if (/urgent/i.test(text)) {
    return 'urgent';
  }
  if (/high/i.test(text)) {
    return 'high';
  }
  if (/low/i.test(text)) {
    return 'low';
  }
  return 'medium';
};

export const parseOperatorIntent = (text: string, taskId?: string): OperatorIntent => {
  const normalized = text.toLowerCase();
  if (CANCEL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      category: 'command',
      referencedTaskId: findTaskId(text, taskId),
      action: {
        type: 'cancel_task',
        taskId: findTaskId(text, taskId),
        reason: text,
      },
    };
  }

  if (REVIEW_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      category: 'command',
      referencedTaskId: findTaskId(text, taskId),
      action: {
        type: 'request_review',
        taskId: findTaskId(text, taskId),
        reason: text,
      },
    };
  }

  if (REPRIORITIZE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      category: 'command',
      referencedTaskId: findTaskId(text, taskId),
      action: {
        type: 'reprioritize',
        taskId: findTaskId(text, taskId),
        priority: detectPriorityLevel(text),
        reason: text,
      },
    };
  }

  return { category: 'note', raw: text, referencedTaskId: taskId };
};
