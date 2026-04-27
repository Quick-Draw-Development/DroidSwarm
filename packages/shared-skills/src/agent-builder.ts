import fs from 'node:fs';
import path from 'node:path';

import {
  getRegisteredAgent,
  getRegisteredSkill,
  listRegisteredAgents,
  updateRegisteredAgentStatus,
  upsertRegisteredAgent,
} from '@shared-projects';

import { agentManifestSchema, type AgentManifest } from './skill-manifest.schema';

export const resolveAgentManifestDir = (skillsRoot: string): string => path.resolve(skillsRoot, 'agents');

const normalizeAgentName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const discoverAgentManifests = (skillsRoot: string): AgentManifest[] => {
  const root = resolveAgentManifestDir(skillsRoot);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.resolve(root, entry))
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown)
    .map((payload) => agentManifestSchema.parse(payload));
};

export const createAgentManifest = (input: {
  skillsRoot: string;
  name: string;
  description?: string;
  skills: string[];
  priority?: AgentManifest['priority'];
  preferredBackend?: string;
  modelTier?: string;
  governanceParticipation?: AgentManifest['governanceParticipation'];
  consensusRoles?: AgentManifest['consensusRoles'];
  projectScoped?: boolean;
  affectsCoreBehavior?: boolean;
}): AgentManifest => {
  const normalizedName = normalizeAgentName(input.name);
  const manifest = agentManifestSchema.parse({
    name: normalizedName,
    version: '0.1.0',
    description: input.description ?? `${normalizedName} specialized agent`,
    skills: input.skills,
    priority: input.priority ?? 'medium',
    projectScoped: input.projectScoped ?? false,
    affectsCoreBehavior: input.affectsCoreBehavior ?? false,
    modelRouting: {
      preferredBackend: input.preferredBackend,
      modelTier: input.modelTier,
    },
    consensusRoles: input.consensusRoles
      ?? (input.governanceParticipation === 'guardian'
        ? ['proposer', 'reviewer', 'verifier', 'guardian']
        : ['proposer', 'reviewer', 'verifier']),
    governanceParticipation: input.governanceParticipation ?? 'participant',
  });

  fs.mkdirSync(resolveAgentManifestDir(input.skillsRoot), { recursive: true });
  fs.writeFileSync(
    path.resolve(resolveAgentManifestDir(input.skillsRoot), `${normalizedName}.json`),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
};

export const syncDiscoveredAgents = (skillsRoot: string) => {
  const manifests = discoverAgentManifests(skillsRoot);
  return manifests.map((manifest) => upsertRegisteredAgent({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    skills: manifest.skills,
    priority: manifest.priority,
    projectScoped: manifest.projectScoped,
    status: manifest.affectsCoreBehavior ? 'pending-approval' : 'active',
    preferredBackend: manifest.modelRouting.preferredBackend,
    modelTier: manifest.modelRouting.modelTier,
    governanceParticipation: manifest.governanceParticipation,
    consensusRoles: manifest.consensusRoles,
    resourceQuotas: manifest.resourceQuotas,
    manifest,
  }));
};

export const listSpecializedAgents = () => listRegisteredAgents();

export const approveSpecializedAgent = (name: string) => updateRegisteredAgentStatus(name, 'active');

export const resolveAgentSkillPacks = (name: string): string[] => {
  const record = getRegisteredAgent(name);
  if (record?.status === 'active') {
    return record.skills;
  }
  const normalized = normalizeAgentName(name);
  const normalizedRecord = normalized === name ? undefined : getRegisteredAgent(normalized);
  return normalizedRecord?.status === 'active' ? normalizedRecord.skills : [];
};

export const buildSpecializedAgent = (name: string): AgentManifest | undefined => {
  const record = getRegisteredAgent(name);
  if (!record || record.status !== 'active') {
    return undefined;
  }
  for (const skillName of record.skills) {
    if (!getRegisteredSkill(skillName)) {
      throw new Error(`Agent ${name} references unknown skill ${skillName}.`);
    }
  }
  return agentManifestSchema.parse(record.manifest);
};
