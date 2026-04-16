import { randomUUID } from 'node:crypto';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type { TaskChatMessage } from '../types';
import { dedupeChatMessages } from '@shared-chat';

export class TaskChatService {
  constructor(private readonly persistence: OrchestratorPersistenceService) {}

  append(input: Omit<TaskChatMessage, 'id' | 'createdAt'>): TaskChatMessage {
    const existing = this.persistence.listTaskChatMessages(input.taskId);
    const message: TaskChatMessage = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const deduped = dedupeChatMessages([...existing, message]);
    if (!deduped.some((entry) => entry.id === message.id)) {
      return deduped[deduped.length - 1] ?? message;
    }
    this.persistence.recordTaskChatMessage(message);
    return message;
  }

  list(taskId: string): TaskChatMessage[] {
    return this.persistence.listTaskChatMessages(taskId);
  }
}
