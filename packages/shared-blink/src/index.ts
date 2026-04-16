import type { TaskChatMessage } from '@shared-types';

export interface BlinkMessageBinding {
  projectId: string;
  taskId: string;
  externalThreadId: string;
  provider: 'blink' | 'slack';
}

export interface BlinkSyncPort {
  publish(message: TaskChatMessage): Promise<void>;
}
