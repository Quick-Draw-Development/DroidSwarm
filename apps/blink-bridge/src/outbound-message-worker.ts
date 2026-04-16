import * as path from 'node:path';

import Database = require('better-sqlite3');

import { BlinkClient } from './blink-client';

export class OutboundMessageWorker {
  private readonly db = new Database(process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'));
  private readonly client = new BlinkClient({
    blinkApiBaseUrl: process.env.DROIDSWARM_BLINK_API_BASE_URL,
    blinkApiToken: process.env.DROIDSWARM_BLINK_API_TOKEN,
    slackApiBaseUrl: process.env.DROIDSWARM_SLACK_API_BASE_URL,
    slackBotToken: process.env.DROIDSWARM_SLACK_BOT_TOKEN,
  });

  async start(): Promise<void> {
    const rows = this.db.prepare(`
      SELECT m.*, b.provider, b.external_thread_id
      FROM task_chat_messages m
      JOIN project_chat_bindings b
        ON b.task_id = m.task_id AND b.project_id = m.project_id
      WHERE COALESCE(json_extract(m.metadata_json, '$.mirrored'), 0) = 0
      ORDER BY m.created_at ASC
    `).all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const provider = String(row.provider);
      const body = String(row.body);
      if (provider === 'slack') {
        const result = await this.client.publishSlack({
          channel: String(row.external_thread_id),
          text: body,
        });
        this.markMirrored(String(row.message_id), {
          mirrored: true,
          provider,
          external_message_id: result.ts,
        });
      } else {
        await this.client.publish({
          id: String(row.message_id),
          taskId: String(row.task_id),
          runId: typeof row.run_id === 'string' ? row.run_id : '',
          projectId: String(row.project_id),
          source: 'blink',
          externalThreadId: typeof row.external_thread_id === 'string' ? row.external_thread_id : undefined,
          authorType: 'agent',
          authorId: String(row.author_id),
          body,
          createdAt: String(row.created_at),
        });
        this.markMirrored(String(row.message_id), {
          mirrored: true,
          provider,
        });
      }
    }
  }

  private markMirrored(messageId: string, metadata: Record<string, unknown>): void {
    this.db.prepare(`
      UPDATE task_chat_messages
      SET metadata_json = @metadataJson
      WHERE message_id = @messageId
    `).run({
      messageId,
      metadataJson: JSON.stringify(metadata),
    });
  }
}
