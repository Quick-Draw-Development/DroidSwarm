import type { TaskChatMessage } from '@shared-types';

export class BlinkClient {
  constructor(
    private readonly options: {
      blinkApiBaseUrl?: string;
      blinkApiToken?: string;
      slackApiBaseUrl?: string;
      slackBotToken?: string;
    } = {},
  ) {}

  async publish(message: TaskChatMessage): Promise<void> {
    if (this.options.blinkApiBaseUrl && this.options.blinkApiToken) {
      await fetch(`${this.options.blinkApiBaseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.blinkApiToken}`,
        },
        body: JSON.stringify(message),
      });
    }
  }

  async publishSlack(input: { channel: string; threadTs?: string; text: string }): Promise<{ ts?: string }> {
    if (!this.options.slackApiBaseUrl || !this.options.slackBotToken) {
      return {};
    }
    const response = await fetch(`${this.options.slackApiBaseUrl.replace(/\/$/, '')}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${this.options.slackBotToken}`,
      },
      body: JSON.stringify({
        channel: input.channel,
        thread_ts: input.threadTs,
        text: input.text,
      }),
    });
    if (!response.ok) {
      return {};
    }
    return await response.json() as { ts?: string };
  }
}
