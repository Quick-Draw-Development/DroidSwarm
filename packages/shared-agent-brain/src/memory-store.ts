import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { appendAuditEvent } from '@shared-tracing';

import { ensureAgentBrainLayout, type AgentBrainLayout } from './layout';

export type BrainMemoryLayer = 'working' | 'episodic' | 'semantic' | 'personal';
export type BrainCandidateStatus = 'pending-review' | 'graduated' | 'rejected' | 'reopened';

export interface BrainMemoryEntry {
  id: string;
  layer: BrainMemoryLayer;
  projectId?: string;
  title: string;
  droidspeak: string;
  content: string;
  tags: string[];
  sourceTaskId?: string;
  sourceRunId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BrainPromotionCandidate {
  candidateId: string;
  projectId?: string;
  clusterKey: string;
  summary: string;
  sourceEntryIds: string[];
  status: BrainCandidateStatus;
  rationale?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

const toJsonLine = (value: unknown): string => `${JSON.stringify(value)}\n`;

const appendJsonLine = (target: string, value: unknown): void => {
  fs.appendFileSync(target, toJsonLine(value));
};

const parseJsonLines = <T>(target: string): T[] => {
  if (!fs.existsSync(target)) {
    return [];
  }
  return fs.readFileSync(target, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
};

const writeJsonLines = (target: string, values: unknown[]): void => {
  fs.writeFileSync(target, values.map((value) => JSON.stringify(value)).join('\n') + (values.length > 0 ? '\n' : ''));
};

const resolveLayerFile = (layout: AgentBrainLayout, layer: BrainMemoryLayer): string => {
  switch (layer) {
    case 'working':
      return path.resolve(layout.workingDir, 'working.jsonl');
    case 'episodic':
      return path.resolve(layout.episodicDir, 'events.jsonl');
    case 'semantic':
      return path.resolve(layout.semanticDir, 'lessons.jsonl');
    case 'personal':
      return path.resolve(layout.personalDir, 'preferences.jsonl');
  }
};

export const writeBrainMemoryEntry = (input: {
  projectRoot?: string;
  global?: boolean;
  layer: BrainMemoryLayer;
  projectId?: string;
  title: string;
  droidspeak: string;
  content: string;
  tags?: string[];
  sourceTaskId?: string;
  sourceRunId?: string;
  metadata?: Record<string, unknown>;
}): BrainMemoryEntry => {
  const layout = ensureAgentBrainLayout({
    projectRoot: input.projectRoot,
    global: input.global,
    projectId: input.projectId,
  });
  const now = new Date().toISOString();
  const entry: BrainMemoryEntry = {
    id: randomUUID(),
    layer: input.layer,
    projectId: input.projectId,
    title: input.title,
    droidspeak: input.droidspeak,
    content: input.content,
    tags: input.tags ?? [],
    sourceTaskId: input.sourceTaskId,
    sourceRunId: input.sourceRunId,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
  appendJsonLine(resolveLayerFile(layout, input.layer), entry);
  appendAuditEvent('AGENT_BRAIN_MEMORY_WRITTEN', {
    layer: input.layer,
    projectId: input.projectId,
    title: input.title,
    entryId: entry.id,
  });
  return entry;
};

export const listBrainMemoryEntries = (input?: {
  projectRoot?: string;
  global?: boolean;
  layer?: BrainMemoryLayer;
  projectId?: string;
  limit?: number;
}): BrainMemoryEntry[] => {
  const layout = ensureAgentBrainLayout({
    projectRoot: input?.projectRoot,
    global: input?.global,
    projectId: input?.projectId,
  });
  const layers: BrainMemoryLayer[] = input?.layer ? [input.layer] : ['working', 'episodic', 'semantic', 'personal'];
  const entries = layers
    .flatMap((layer) => parseJsonLines<BrainMemoryEntry>(resolveLayerFile(layout, layer)))
    .filter((entry) => !input?.projectId || entry.projectId == null || entry.projectId === input.projectId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return entries.slice(0, Math.max(1, input?.limit ?? (entries.length || 1)));
};

const reviewStateFile = (layout: AgentBrainLayout): string =>
  path.resolve(layout.memoryRoot, 'review_state.jsonl');

export const listBrainPromotionCandidates = (input?: {
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
  status?: BrainCandidateStatus;
}): BrainPromotionCandidate[] => {
  const layout = ensureAgentBrainLayout({
    projectRoot: input?.projectRoot,
    global: input?.global,
    projectId: input?.projectId,
  });
  return parseJsonLines<BrainPromotionCandidate>(reviewStateFile(layout))
    .filter((entry) => !input?.projectId || entry.projectId == null || entry.projectId === input.projectId)
    .filter((entry) => !input?.status || entry.status === input.status)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const renderLessonsMarkdown = (layout: AgentBrainLayout, entries: BrainMemoryEntry[]): void => {
  const lines = [
    '# Lessons',
    '',
    ...entries.map((entry) => `## ${entry.title}\n\n${entry.content}\n\nTags: ${entry.tags.join(', ') || 'none'}\n`),
  ];
  fs.writeFileSync(path.resolve(layout.semanticDir, 'LESSONS.md'), `${lines.join('\n')}\n`);
};

export const reviewBrainPromotionCandidate = (input: {
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
  candidateId: string;
  action: 'graduate' | 'reject' | 'reopen';
  rationale: string;
  reviewedBy: string;
}): BrainPromotionCandidate => {
  const layout = ensureAgentBrainLayout({
    projectRoot: input.projectRoot,
    global: input.global,
    projectId: input.projectId,
  });
  const candidates = parseJsonLines<BrainPromotionCandidate>(reviewStateFile(layout));
  const index = candidates.findIndex((entry) => entry.candidateId === input.candidateId);
  if (index < 0) {
    throw new Error(`Unknown promotion candidate: ${input.candidateId}`);
  }
  const now = new Date().toISOString();
  const current = candidates[index]!;
  const updated: BrainPromotionCandidate = {
    ...current,
    status: input.action === 'graduate' ? 'graduated' : input.action === 'reject' ? 'rejected' : 'reopened',
    rationale: input.rationale,
    reviewedBy: input.reviewedBy,
    updatedAt: now,
  };
  candidates[index] = updated;
  writeJsonLines(reviewStateFile(layout), candidates);

  if (input.action === 'graduate') {
    writeBrainMemoryEntry({
      projectRoot: input.projectRoot,
      global: input.global,
      layer: 'semantic',
      projectId: updated.projectId,
      title: updated.summary,
      droidspeak: 'memory.pinned',
      content: `${updated.summary}\n\nReview rationale: ${input.rationale}`,
      tags: ['promoted-lesson', updated.clusterKey],
      metadata: {
        candidateId: updated.candidateId,
        reviewedBy: input.reviewedBy,
      },
    });
    renderLessonsMarkdown(layout, listBrainMemoryEntries({
      projectRoot: input.projectRoot,
      global: input.global,
      projectId: input.projectId,
      layer: 'semantic',
      limit: 250,
    }));
  }

  appendAuditEvent('AGENT_BRAIN_MEMORY_REVIEWED', {
    candidateId: updated.candidateId,
    action: input.action,
    reviewedBy: input.reviewedBy,
    rationale: input.rationale,
  });
  return updated;
};

export const appendBrainPromotionCandidate = (input: {
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
  clusterKey: string;
  summary: string;
  sourceEntryIds: string[];
}): BrainPromotionCandidate => {
  const layout = ensureAgentBrainLayout({
    projectRoot: input.projectRoot,
    global: input.global,
    projectId: input.projectId,
  });
  const existing = listBrainPromotionCandidates({
    projectRoot: input.projectRoot,
    global: input.global,
    projectId: input.projectId,
  }).find((entry) => entry.clusterKey === input.clusterKey && entry.summary === input.summary && entry.status !== 'rejected');
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const candidate: BrainPromotionCandidate = {
    candidateId: randomUUID(),
    projectId: input.projectId,
    clusterKey: input.clusterKey,
    summary: input.summary,
    sourceEntryIds: input.sourceEntryIds,
    status: 'pending-review',
    createdAt: now,
    updatedAt: now,
  };
  appendJsonLine(reviewStateFile(layout), candidate);
  return candidate;
};

export const getBrainStatus = (input?: {
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
}) => {
  const layout = ensureAgentBrainLayout(input);
  const memories = listBrainMemoryEntries({
    projectRoot: input?.projectRoot,
    global: input?.global,
    projectId: input?.projectId,
    limit: 500,
  });
  const candidates = listBrainPromotionCandidates(input);
  return {
    root: layout.root,
    workingCount: memories.filter((entry) => entry.layer === 'working').length,
    episodicCount: memories.filter((entry) => entry.layer === 'episodic').length,
    semanticCount: memories.filter((entry) => entry.layer === 'semantic').length,
    personalCount: memories.filter((entry) => entry.layer === 'personal').length,
    pendingCandidateCount: candidates.filter((entry) => entry.status === 'pending-review' || entry.status === 'reopened').length,
    skillIndexPresent: fs.existsSync(path.resolve(layout.skillsDir, '_manifest.jsonl')),
  };
};
