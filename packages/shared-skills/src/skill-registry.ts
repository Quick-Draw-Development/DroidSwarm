import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { validateCompliance } from '@shared-governance';
import {
  getRegisteredSkill,
  listRegisteredSkills,
  updateRegisteredSkillStatus,
  upsertRegisteredSkill,
} from '@shared-projects';
import { appendAuditEvent, tracer } from '@shared-tracing';

import { skillManifestSchema, type SkillManifest, type SkillVerbManifest } from './skill-manifest.schema';

export interface SkillPack {
  name: string;
  instructions: string;
  filePath: string;
  manifest?: SkillManifest;
}

const stableSerialize = (input: unknown): string => {
  if (input == null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};

const hashManifest = (input: unknown): string =>
  createHash('sha256').update(stableSerialize(input)).digest('hex');

export const resolveSkillsRoot = (rootDir?: string): string =>
  path.resolve(rootDir ?? process.env.DROIDSWARM_SKILLS_DIR ?? path.resolve(process.cwd(), 'skills'));

const resolveSkillDir = (rootDir: string, name: string): string => path.resolve(rootDir, name);

const resolveSkillManifestFile = (rootDir: string, name: string): string => path.resolve(resolveSkillDir(rootDir, name), 'manifest.json');

const normalizeSkillName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const fallbackSkillManifest = (rootDir: string, name: string): SkillManifest => {
  const filePath = path.resolve(rootDir, name, 'SKILL.md');
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const description = raw.split('\n').find((line) => line.trim().length > 0)?.trim() ?? `${name} skill pack`;
  return skillManifestSchema.parse({
    name,
    version: '0.1.0',
    description,
    instructionsFile: 'SKILL.md',
    entry: 'index.ts',
  });
};

export const discoverSkillManifests = (rootDir = resolveSkillsRoot()): SkillManifest[] => {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'agents')
    .map((entry) => {
      const manifestPath = resolveSkillManifestFile(rootDir, entry.name);
      if (!fs.existsSync(manifestPath)) {
        return fallbackSkillManifest(rootDir, entry.name);
      }
      const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
      return skillManifestSchema.parse(payload);
    });
};

export const loadSkillPack = (rootDir: string, name: string): SkillPack | null => {
  const filePath = path.join(rootDir, name, 'SKILL.md');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const manifest = discoverSkillManifests(rootDir).find((entry) => entry.name === name);
  return {
    name,
    instructions: fs.readFileSync(filePath, 'utf8'),
    filePath,
    manifest,
  };
};

export const loadSkillPacks = (rootDir: string, names: string[]): SkillPack[] =>
  names.map((name) => loadSkillPack(rootDir, name)).filter((skill): skill is SkillPack => skill !== null);

export const syncDiscoveredSkills = (rootDir = resolveSkillsRoot()) => {
  const manifests = discoverSkillManifests(rootDir);
  return manifests.map((manifest) => {
    const status = manifest.affectsCoreBehavior ? 'pending-approval' : 'active';
    const record = upsertRegisteredSkill({
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      projectScoped: manifest.projectScoped,
      capabilities: manifest.capabilities,
      requiredBackends: manifest.requiredBackends,
      droidspeakVerbs: manifest.droidspeakVerbs,
      status,
      manifest,
    });
    try {
      appendAuditEvent('SKILL_REGISTERED', {
        skill: manifest.name,
        hash: hashManifest(manifest),
        status,
      });
    } catch (error) {
      tracer.warn('skills.audit.append_failed', {
        skill: manifest.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return record;
  });
};

export const approveRegisteredSkill = (name: string) => updateRegisteredSkillStatus(name, 'active');

export const listRegisteredSkillManifests = () => listRegisteredSkills();

export const buildDynamicSkillVerbCatalog = (): Record<string, string> => {
  const activeSkills = listRegisteredSkills().filter((entry) => entry.status === 'active');
  return Object.fromEntries(
    activeSkills.flatMap((entry) => entry.droidspeakVerbs.map((verb) => [verb.code, verb.label])),
  );
};

export const watchSkillRegistry = (
  rootDir: string,
  onReload: (payload: { skills: number }) => void,
): (() => void) => {
  if (!fs.existsSync(rootDir)) {
    return () => undefined;
  }

  const watcher = fs.watch(rootDir, { recursive: true }, () => {
    try {
      const skills = syncDiscoveredSkills(rootDir);
      onReload({ skills: skills.length });
    } catch (error) {
      tracer.warn('skills.watch.reload_failed', {
        rootDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return () => watcher.close();
};

const skillTemplateBody = (name: string, template: string): { skill: string; manifest: SkillManifest; entry: string; spec: string } => {
  const normalized = normalizeSkillName(name);
  const manifest = skillManifestSchema.parse({
    name: normalized,
    version: '0.1.0',
    description: `${normalized} ${template} skill for DroidSwarm`,
    capabilities: [template],
    requiredBackends: template === 'research' ? ['apple-intelligence', 'mlx', 'local-llama'] : ['codex-cli', 'local-llama'],
    droidspeakVerbs: [
      {
        code: `EVT-SKILL-${normalized.toUpperCase().replace(/-/g, '_')}`,
        label: `${normalized} skill activity`,
      },
    ],
    projectScoped: false,
    affectsCoreBehavior: false,
    entry: 'index.ts',
    instructionsFile: 'SKILL.md',
  });

  return {
    skill: `# ${normalized}\n\nDescribe how the ${normalized} skill should operate.\n`,
    manifest,
    entry: `export const ${normalized.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}Skill = {\n  name: '${normalized}',\n  template: '${template}',\n};\n`,
    spec: `import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('${normalized} scaffold exports the skill marker', async () => {\n  const module = await import('./index');\n  assert.ok(module);\n});\n`,
  };
};

export const createSkillScaffold = (input: {
  rootDir?: string;
  name: string;
  template?: 'basic' | 'research' | 'code' | 'review' | 'custom';
}) => {
  const rootDir = resolveSkillsRoot(input.rootDir);
  const normalized = normalizeSkillName(input.name);
  const skillDir = resolveSkillDir(rootDir, normalized);
  if (fs.existsSync(skillDir)) {
    throw new Error(`Skill already exists: ${normalized}`);
  }

  const template = input.template ?? 'basic';
  const payload = skillTemplateBody(normalized, template);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.resolve(skillDir, 'SKILL.md'), payload.skill);
  fs.writeFileSync(path.resolve(skillDir, 'manifest.json'), JSON.stringify(payload.manifest, null, 2));
  fs.writeFileSync(path.resolve(skillDir, 'index.ts'), payload.entry);
  fs.writeFileSync(path.resolve(skillDir, 'index.spec.ts'), payload.spec);
  syncDiscoveredSkills(rootDir);
  return payload.manifest;
};

export const buildSkill = (name: string, rootDir = resolveSkillsRoot()) => {
  const manifest = discoverSkillManifests(rootDir).find((entry) => entry.name === normalizeSkillName(name));
  if (!manifest) {
    throw new Error(`Unknown skill: ${name}`);
  }
  const report = validateCompliance({
    eventType: 'skill.register',
    actorRole: 'skill-builder',
    swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
    projectId: process.env.DROIDSWARM_PROJECT_ID,
    auditLoggingEnabled: true,
    dashboardEnabled: false,
    droidspeakState: manifest.droidspeakVerbs.length > 0
      ? { compact: manifest.droidspeakVerbs[0]?.code ?? 'EVT-UPDATE', expanded: manifest.name, kind: 'memory_pinned' }
      : undefined,
  });
  if (!report.ok) {
    throw new Error(report.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '));
  }
  const record = syncDiscoveredSkills(rootDir).find((entry) => entry.name === manifest.name);
  return {
    manifest,
    record,
  };
};

export const getRegisteredSkillManifest = (name: string) => getRegisteredSkill(normalizeSkillName(name));

export const resolveSkillPacksForAgent = (name: string): string[] => {
  const record = getRegisteredSkillManifest(name);
  return record?.status === 'active' ? [record.name] : [];
};
