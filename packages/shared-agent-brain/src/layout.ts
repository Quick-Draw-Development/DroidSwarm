import fs from 'node:fs';
import path from 'node:path';

import { resolveDroidSwarmHome } from '@shared-persistence';
import { appendAuditEvent } from '@shared-tracing';

export interface AgentBrainLayout {
  root: string;
  memoryRoot: string;
  workingDir: string;
  episodicDir: string;
  semanticDir: string;
  personalDir: string;
  skillsDir: string;
  protocolsDir: string;
  toolsDir: string;
  harnessDir: string;
}

const ensureDir = (target: string): void => {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
};

const writeIfMissing = (target: string, content: string): void => {
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, content);
  }
};

export const resolveGlobalAgentBrainRoot = (): string =>
  path.resolve(resolveDroidSwarmHome(), 'global.agent');

export const resolveAgentBrainRoot = (input?: {
  projectRoot?: string;
  global?: boolean;
}): string => {
  if (input?.global) {
    return resolveGlobalAgentBrainRoot();
  }
  return path.resolve(input?.projectRoot ?? process.cwd(), '.agent');
};

export const describeAgentBrainLayout = (input?: {
  projectRoot?: string;
  global?: boolean;
}): AgentBrainLayout => {
  const root = resolveAgentBrainRoot(input);
  const memoryRoot = path.resolve(root, 'memory');
  return {
    root,
    memoryRoot,
    workingDir: path.resolve(memoryRoot, 'working'),
    episodicDir: path.resolve(memoryRoot, 'episodic'),
    semanticDir: path.resolve(memoryRoot, 'semantic'),
    personalDir: path.resolve(memoryRoot, 'personal'),
    skillsDir: path.resolve(root, 'skills'),
    protocolsDir: path.resolve(root, 'protocols'),
    toolsDir: path.resolve(root, 'tools'),
    harnessDir: path.resolve(root, 'harness'),
  };
};

export const renderBrainAgentsMap = (layout: AgentBrainLayout): string => [
  '# Portable Agent Brain',
  '',
  'This directory is managed by DroidSwarm and provides a portable local-first agent brain.',
  '',
  '## Structure',
  '',
  '- `harness/`: DroidSwarm-specific runtime hooks',
  '- `memory/working/`: volatile short-term state',
  '- `memory/episodic/`: chronological action logs',
  '- `memory/semantic/`: curated lessons and durable abstractions',
  '- `memory/personal/`: operator preferences and personal toggles',
  '- `skills/`: skill manifests and progressive-disclosure indexes',
  '- `protocols/`: permission and delegation rules',
  '- `tools/`: CLI helpers and generated indexes',
  '',
  `Brain root: ${layout.root}`,
].join('\n');

export const ensureAgentBrainLayout = (input?: {
  projectRoot?: string;
  global?: boolean;
  projectId?: string;
}): AgentBrainLayout => {
  const layout = describeAgentBrainLayout(input);
  ensureDir(layout.root);
  ensureDir(layout.harnessDir);
  ensureDir(layout.memoryRoot);
  ensureDir(layout.workingDir);
  ensureDir(layout.episodicDir);
  ensureDir(layout.semanticDir);
  ensureDir(layout.personalDir);
  ensureDir(layout.skillsDir);
  ensureDir(layout.protocolsDir);
  ensureDir(layout.toolsDir);

  writeIfMissing(path.resolve(layout.root, 'AGENTS.md'), `${renderBrainAgentsMap(layout)}\n`);
  writeIfMissing(path.resolve(layout.protocolsDir, 'permissions.md'), '# Permissions\n\nUse DroidSwarm governance and operator approval before durable promotion or rewrite.\n');
  writeIfMissing(path.resolve(layout.protocolsDir, 'delegation.md'), '# Delegation\n\nPrefer manifest-first skill discovery and bounded helper delegation.\n');
  writeIfMissing(path.resolve(layout.personalDir, 'PREFERENCES.md'), '# Preferences\n\nNo recorded personal preferences yet.\n');
  writeIfMissing(path.resolve(layout.semanticDir, 'LESSONS.md'), '# Lessons\n\nNo promoted lessons yet.\n');
  writeIfMissing(path.resolve(layout.memoryRoot, 'review_state.jsonl'), '');
  writeIfMissing(path.resolve(layout.workingDir, 'working.jsonl'), '');
  writeIfMissing(path.resolve(layout.episodicDir, 'events.jsonl'), '');
  writeIfMissing(path.resolve(layout.semanticDir, 'lessons.jsonl'), '');
  writeIfMissing(path.resolve(layout.personalDir, 'preferences.jsonl'), '');

  try {
    appendAuditEvent('AGENT_BRAIN_LAYOUT_READY', {
      root: layout.root,
      global: input?.global === true,
      projectId: input?.projectId,
    });
  } catch {
    // Layout creation should not fail in environments without audit storage.
  }
  return layout;
};
