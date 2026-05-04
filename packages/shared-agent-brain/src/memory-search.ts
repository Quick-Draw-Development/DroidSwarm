import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { ensureAgentBrainLayout } from './layout';
import { listBrainMemoryEntries, type BrainMemoryEntry } from './memory-store';

export interface BrainMemorySearchResult {
  entryId?: string;
  layer: string;
  title: string;
  content: string;
  path?: string;
  score: number;
}

const ftsDisabled = (): boolean =>
  ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_AGENTIC_BRAIN_DISABLE_FTS ?? '').toLowerCase());

const indexEntries = (database: Database.Database, entries: BrainMemoryEntry[]): void => {
  database.exec(`
    CREATE VIRTUAL TABLE brain_fts USING fts5(
      entry_id UNINDEXED,
      layer,
      title,
      content,
      tokenize = 'porter unicode61'
    );
  `);
  const insert = database.prepare(`
    INSERT INTO brain_fts (entry_id, layer, title, content)
    VALUES (?, ?, ?, ?)
  `);
  for (const entry of entries) {
    insert.run(entry.id, entry.layer, entry.title, `${entry.content}\n${entry.tags.join(' ')}`);
  }
};

const searchWithFts = (entries: BrainMemoryEntry[], query: string, limit: number): BrainMemorySearchResult[] => {
  const database = new Database(':memory:');
  try {
    indexEntries(database, entries);
    const rows = database.prepare(`
      SELECT entry_id, layer, title, content, bm25(brain_fts) AS score
      FROM brain_fts
      WHERE brain_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(query, limit) as Array<{
      entry_id: string;
      layer: string;
      title: string;
      content: string;
      score: number;
    }>;
    return rows.map((row) => ({
      entryId: row.entry_id,
      layer: row.layer,
      title: row.title,
      content: row.content,
      score: Number.isFinite(row.score) ? Math.max(0.01, 1 / Math.abs(row.score || -1)) : 1,
    }));
  } finally {
    database.close();
  }
};

const searchWithRipgrep = (memoryRoot: string, query: string, limit: number): BrainMemorySearchResult[] => {
  const rgBin = fs.existsSync('/opt/homebrew/bin/rg') ? '/opt/homebrew/bin/rg' : 'rg';
  try {
    const stdout = execFileSync(rgBin, ['-n', '--no-heading', query, memoryRoot], {
      encoding: 'utf8',
    });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, limit)
      .map((line, index) => {
        const [filePath, , ...rest] = line.split(':');
        return {
          layer: filePath?.includes('/working/') ? 'working' : filePath?.includes('/semantic/') ? 'semantic' : filePath?.includes('/personal/') ? 'personal' : 'episodic',
          title: path.basename(filePath ?? 'match'),
          content: rest.join(':').trim(),
          path: filePath,
          score: Math.max(0.1, 1 - index / Math.max(1, limit)),
        };
      });
  } catch {
    try {
      const stdout = execFileSync('grep', ['-RIn', query, memoryRoot], {
        encoding: 'utf8',
      });
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, limit)
        .map((line, index) => {
          const [filePath, , ...rest] = line.split(':');
          return {
            layer: filePath?.includes('/working/') ? 'working' : filePath?.includes('/semantic/') ? 'semantic' : filePath?.includes('/personal/') ? 'personal' : 'episodic',
            title: path.basename(filePath ?? 'match'),
            content: rest.join(':').trim(),
            path: filePath,
            score: Math.max(0.1, 1 - index / Math.max(1, limit)),
          };
        });
    } catch {
      return [];
    }
  }
};

export const searchBrainMemories = (input: {
  query: string;
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
  limit?: number;
}): BrainMemorySearchResult[] => {
  const layout = ensureAgentBrainLayout({
    projectRoot: input.projectRoot,
    global: input.global,
    projectId: input.projectId,
  });
  const limit = Math.max(1, input.limit ?? 8);
  const entries = listBrainMemoryEntries({
    projectRoot: input.projectRoot,
    global: input.global,
    projectId: input.projectId,
    limit: 400,
  });
  if (entries.length === 0) {
    return [];
  }
  if (!ftsDisabled()) {
    try {
      return searchWithFts(entries, input.query, limit);
    } catch {
      // Fall back to ripgrep/grep when FTS5 is unavailable.
    }
  }
  return searchWithRipgrep(layout.memoryRoot, input.query, limit);
};
