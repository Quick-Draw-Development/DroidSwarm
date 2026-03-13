export const BOARD_STATUSES = ['todo', 'planning', 'in_progress', 'review', 'done', 'cancelled'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export interface TaskRecord {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  taskType: 'feature' | 'bug' | 'hotfix' | 'task';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: BoardStatus;
  branchType?: string;
  branchName?: string;
  createdByUserId: string;
  createdByDisplayName: string;
  needsClarification: boolean;
  blockedReason?: string;
  updatedAt: string;
  agentCount: number;
}

export interface MessageRecord {
  messageId: string;
  projectId: string;
  channelId: string;
  taskId?: string;
  messageType: string;
  senderType: string;
  senderName: string;
  content: string;
  payload: Record<string, unknown>;
  createdAt: string;
  mentionTarget?: string;
}

export interface TaskDetails {
  task: TaskRecord;
  messages: MessageRecord[];
  activeAgents: Array<{
    name: string;
    role: string;
    lastSeenAt: string;
  }>;
  handoffs: string[];
  guardrails: string[];
  limits: string[];
}

export interface ProjectIdentity {
  projectId: string;
  projectName: string;
}
