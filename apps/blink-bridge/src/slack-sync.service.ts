import type { TaskChatMessage } from '@shared-types';
import { BlinkClient } from './blink-client';

export class SlackSyncService {
  constructor(private readonly client = new BlinkClient()) {}

  async sync(message: TaskChatMessage): Promise<void> {
    await this.client.publish(message);
  }
}
