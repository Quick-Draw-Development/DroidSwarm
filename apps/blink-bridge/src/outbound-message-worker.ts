import * as path from 'node:path';

import Database = require('better-sqlite3');

import { BlinkClient } from './blink-client';

export class OutboundMessageWorker {
  private readonly db: Database.Database;
  private readonly client: Pick<BlinkClient, 'publish' | 'publishSlack'>;

  constructor(options: {
    db?: Database.Database;
    client?: Pick<BlinkClient, 'publish' | 'publishSlack'>;
  } = {}) {
    this.db = options.db ?? new Database(process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'));
    this.client = options.client ?? new BlinkClient({
      blinkApiBaseUrl: process.env.DROIDSWARM_BLINK_API_BASE_URL,
      blinkApiToken: process.env.DROIDSWARM_BLINK_API_TOKEN,
      slackApiBaseUrl: process.env.DROIDSWARM_SLACK_API_BASE_URL,
      slackBotToken: process.env.DROIDSWARM_SLACK_BOT_TOKEN,
    });
  }

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
      const messageId = String(row.message_id);
      const attemptCount = this.incrementMirrorAttempt(messageId, provider);
      try {
        if (provider === 'slack') {
          const result = await this.client.publishSlack({
            channel: String(row.external_thread_id),
            text: body,
          });
          this.markMirrored(messageId, {
            mirrored: true,
            provider,
            external_message_id: result.ts,
            mirror_attempts: attemptCount,
            mirror_failure_count: Math.max(0, attemptCount - 1),
            mirror_last_error: null,
            mirrored_at: new Date().toISOString(),
          });
        } else {
          await this.client.publish({
            id: messageId,
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
          this.markMirrored(messageId, {
            mirrored: true,
            provider,
            mirror_attempts: attemptCount,
            mirror_failure_count: Math.max(0, attemptCount - 1),
            mirror_last_error: null,
            mirrored_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.markMirrorFailure(messageId, provider, attemptCount, error);
      }
    }
  }

  private getMessageMetadata(messageId: string): Record<string, unknown> {
    const row = this.db.prepare(`
      SELECT metadata_json
      FROM task_chat_messages
      WHERE message_id = ?
      LIMIT 1
    `).get(messageId) as { metadata_json?: string | null } | undefined;
    if (!row?.metadata_json) {
      return {};
    }
    try {
      const parsed = JSON.parse(row.metadata_json) as Record<string, unknown>;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeMetadata(messageId: string, metadata: Record<string, unknown>): void {
    this.db.prepare(`
      UPDATE task_chat_messages
      SET metadata_json = @metadataJson
      WHERE message_id = @messageId
    `).run({
      messageId,
      metadataJson: JSON.stringify(metadata),
    });
  }

  private incrementMirrorAttempt(messageId: string, provider: string): number {
    const metadata = this.getMessageMetadata(messageId);
    const nextAttempts = typeof metadata.mirror_attempts === 'number' ? metadata.mirror_attempts + 1 : 1;
    this.writeMetadata(messageId, {
      ...metadata,
      provider,
      mirror_attempts: nextAttempts,
      mirror_last_attempt_at: new Date().toISOString(),
    });
    return nextAttempts;
  }

  private markMirrored(messageId: string, metadata: Record<string, unknown>): void {
    this.writeMetadata(messageId, {
      ...this.getMessageMetadata(messageId),
      ...metadata,
    });
  }

  private markMirrorFailure(messageId: string, provider: string, attemptCount: number, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Blink mirror failed.';
    this.writeMetadata(messageId, {
      ...this.getMessageMetadata(messageId),
      mirrored: false,
      provider,
      mirror_attempts: attemptCount,
      mirror_failure_count: attemptCount,
      mirror_last_error: message,
      mirror_last_failed_at: new Date().toISOString(),
    });
  }
}
