import { randomUUID } from 'node:crypto';

import { openLongTermMemoryDatabase } from '@shared-persistence';
import { appendAuditEvent } from '@shared-tracing';

export type LongTermMemoryType = 'semantic' | 'procedural' | 'pattern' | 'user-preference';
export type LongTermMemoryScope = 'project' | 'global' | 'personal';

export interface LongTermMemoryEntry {
  memoryId: string;
  projectId?: string;
  sessionId?: string;
  scope: LongTermMemoryScope;
  timestamp: string;
  memoryType: LongTermMemoryType;
  droidspeakSummary: string;
  englishTranslation: string;
  sourceEventHash?: string;
  sourceTaskId?: string;
  sourceRunId?: string;
  relevanceScore: number;
  embedding: number[];
  metadata: Record<string, unknown>;
  expiresAt?: string;
}

export interface CreateLongTermMemoryInput {
  projectId?: string;
  sessionId?: string;
  scope?: LongTermMemoryScope;
  memoryType: LongTermMemoryType;
  droidspeakSummary: string;
  englishTranslation: string;
  sourceEventHash?: string;
  sourceTaskId?: string;
  sourceRunId?: string;
  relevanceScore?: number;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as unknown;
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const parseJsonArray = (value: unknown): number[] => {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is number => typeof entry === 'number') : [];
  } catch {
    return [];
  }
};

const normalizeMemoryEntry = (row: Record<string, unknown>): LongTermMemoryEntry => ({
  memoryId: String(row.memory_id),
  projectId: typeof row.project_id === 'string' ? row.project_id : undefined,
  sessionId: typeof row.session_id === 'string' ? row.session_id : undefined,
  scope: row.scope === 'global' ? 'global' : row.scope === 'personal' ? 'personal' : 'project',
  timestamp: String(row.timestamp),
  memoryType:
    row.memory_type === 'procedural'
      ? 'procedural'
      : row.memory_type === 'pattern'
        ? 'pattern'
        : row.memory_type === 'user-preference'
          ? 'user-preference'
          : 'semantic',
  droidspeakSummary: String(row.droidspeak_summary),
  englishTranslation: String(row.english_translation),
  sourceEventHash: typeof row.source_event_hash === 'string' ? row.source_event_hash : undefined,
  sourceTaskId: typeof row.source_task_id === 'string' ? row.source_task_id : undefined,
  sourceRunId: typeof row.source_run_id === 'string' ? row.source_run_id : undefined,
  relevanceScore: typeof row.relevance_score === 'number' ? row.relevance_score : Number(row.relevance_score ?? 0),
  embedding: parseJsonArray(row.embedding_json),
  metadata: parseJsonObject(row.metadata_json),
  expiresAt: typeof row.expires_at === 'string' ? row.expires_at : undefined,
});

export const createLongTermMemory = (input: CreateLongTermMemoryInput): LongTermMemoryEntry => {
  const database = openLongTermMemoryDatabase();
  try {
    const record = {
      memoryId: randomUUID(),
      projectId: input.projectId ?? null,
      sessionId: input.sessionId ?? null,
      scope: input.scope ?? 'project',
      timestamp: new Date().toISOString(),
      memoryType: input.memoryType,
      droidspeakSummary: input.droidspeakSummary,
      englishTranslation: input.englishTranslation,
      sourceEventHash: input.sourceEventHash ?? null,
      sourceTaskId: input.sourceTaskId ?? null,
      sourceRunId: input.sourceRunId ?? null,
      relevanceScore: input.relevanceScore ?? 0.5,
      embeddingJson: JSON.stringify(input.embedding ?? []),
      metadataJson: JSON.stringify(input.metadata ?? {}),
      expiresAt: input.expiresAt ?? null,
    };
    database.prepare(`
      INSERT INTO long_term_memory (
        memory_id, project_id, session_id, scope, timestamp, memory_type, droidspeak_summary,
        english_translation, source_event_hash, source_task_id, source_run_id, relevance_score,
        embedding_json, metadata_json, expires_at
      ) VALUES (
        @memoryId, @projectId, @sessionId, @scope, @timestamp, @memoryType, @droidspeakSummary,
        @englishTranslation, @sourceEventHash, @sourceTaskId, @sourceRunId, @relevanceScore,
        @embeddingJson, @metadataJson, @expiresAt
      )
    `).run(record);
    appendAuditEvent('LONG_TERM_MEMORY_WRITTEN', {
      memoryId: record.memoryId,
      projectId: input.projectId,
      scope: record.scope,
      memoryType: record.memoryType,
    });
    return normalizeMemoryEntry({
      memory_id: record.memoryId,
      project_id: record.projectId,
      session_id: record.sessionId,
      scope: record.scope,
      timestamp: record.timestamp,
      memory_type: record.memoryType,
      droidspeak_summary: record.droidspeakSummary,
      english_translation: record.englishTranslation,
      source_event_hash: record.sourceEventHash,
      source_task_id: record.sourceTaskId,
      source_run_id: record.sourceRunId,
      relevance_score: record.relevanceScore,
      embedding_json: record.embeddingJson,
      metadata_json: record.metadataJson,
      expires_at: record.expiresAt,
    });
  } finally {
    database.close();
  }
};

export const listLongTermMemories = (input?: {
  projectId?: string;
  scope?: LongTermMemoryScope;
  memoryType?: LongTermMemoryType;
  limit?: number;
}): LongTermMemoryEntry[] => {
  const database = openLongTermMemoryDatabase();
  try {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input?.projectId) {
      clauses.push('(project_id = ? OR scope IN (\'global\', \'personal\'))');
      values.push(input.projectId);
    }
    if (input?.scope) {
      clauses.push('scope = ?');
      values.push(input.scope);
    }
    if (input?.memoryType) {
      clauses.push('memory_type = ?');
      values.push(input.memoryType);
    }
    clauses.push('(expires_at IS NULL OR expires_at > ?)');
    values.push(new Date().toISOString());
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = input?.limit ? `LIMIT ${Math.max(1, input.limit)}` : '';
    return (database.prepare(`
      SELECT *
      FROM long_term_memory
      ${whereClause}
      ORDER BY timestamp DESC, relevance_score DESC
      ${limitClause}
    `).all(...values) as Record<string, unknown>[])
      .map(normalizeMemoryEntry);
  } finally {
    database.close();
  }
};

export const pruneLongTermMemories = (input?: {
  olderThanIso?: string;
  maxPerProject?: number;
}): number => {
  const database = openLongTermMemoryDatabase();
  try {
    let removed = 0;
    if (input?.olderThanIso) {
      removed += database.prepare(`
        DELETE FROM long_term_memory
        WHERE timestamp < ?
          OR (expires_at IS NOT NULL AND expires_at <= ?)
      `).run(input.olderThanIso, new Date().toISOString()).changes;
    }
    if (input?.maxPerProject && input.maxPerProject > 0) {
      const rows = database.prepare(`
        SELECT memory_id, project_id,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(project_id, scope) ORDER BY relevance_score DESC, timestamp DESC) AS rn
        FROM long_term_memory
      `).all() as Array<{ memory_id: string; project_id?: string; rn: number }>;
      const ids = rows.filter((row) => row.rn > input.maxPerProject!).map((row) => row.memory_id);
      for (const id of ids) {
        removed += database.prepare(`DELETE FROM long_term_memory WHERE memory_id = ?`).run(id).changes;
      }
    }
    return removed;
  } finally {
    database.close();
  }
};
