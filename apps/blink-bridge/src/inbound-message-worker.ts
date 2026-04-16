import * as path from 'node:path';

import Database = require('better-sqlite3');

export class InboundMessageWorker {
  private readonly db = new Database(process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'));

  async start(): Promise<void> {
    const raw = process.env.DROIDSWARM_BRIDGE_INBOUND_MESSAGES;
    if (!raw) {
      return;
    }
    const messages = JSON.parse(raw) as Array<Record<string, unknown>>;
    for (const message of messages) {
      const externalMessageId = String(message.externalMessageId ?? '');
      const existing = this.db.prepare(`
        SELECT message_id
        FROM task_chat_messages
        WHERE external_message_id = ?
        LIMIT 1
      `).get(externalMessageId) as { message_id?: string } | undefined;
      if (existing?.message_id) {
        continue;
      }
      this.db.prepare(`
        INSERT INTO task_chat_messages (
          message_id, task_id, run_id, project_id, source, external_thread_id, external_message_id,
          author_type, author_id, body, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(message.id),
        String(message.taskId),
        String(message.runId ?? ''),
        String(message.projectId),
        String(message.source ?? 'slack'),
        String(message.externalThreadId ?? ''),
        externalMessageId,
        String(message.authorType ?? 'user'),
        String(message.authorId ?? 'external'),
        String(message.body ?? ''),
        JSON.stringify({ mirrored: true }),
        String(message.createdAt ?? new Date().toISOString()),
      );
    }
  }
}
