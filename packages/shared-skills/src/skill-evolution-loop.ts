import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { runConsensusRound } from '@shared-governance';
import { createLongTermMemory, listLongTermMemories, runReflectionCycle } from '@shared-memory';
import {
  getSkillEvolutionProposal,
  listSkillEvolutionProposals,
  upsertSkillEvolutionProposal,
} from '@shared-projects';
import { appendAuditEvent } from '@shared-tracing';

import { createSkillScaffold, discoverSkillManifests, resolveSkillsRoot } from './skill-registry';
import { skillManifestSchema, type SkillManifest } from './skill-manifest.schema';

const normalizeSkillName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const buildEvolutionStub = (name: string, description: string): Record<string, string> => ({
  'SKILL.md': `# ${name}\n\n${description}\n`,
  'manifest.json': JSON.stringify(skillManifestSchema.parse({
    name,
    version: '0.1.0',
    description,
    capabilities: ['memory', 'reflection'],
    requiredBackends: ['apple-intelligence', 'mlx', 'local-llama', 'openmythos'],
    droidspeakVerbs: [
      {
        code: `EVT-SKILL-${name.toUpperCase().replace(/-/g, '_')}`,
        label: `${name} evolution activity`,
      },
    ],
    projectScoped: false,
    affectsCoreBehavior: false,
    instructionsFile: 'SKILL.md',
    entry: 'index.ts',
  }), null, 2),
  'index.ts': `export const evolvedSkill = { name: '${name}' };\n`,
});

export const evolveSkill = (existingSkillId: string): SkillManifest => {
  const manifest = discoverSkillManifests(resolveSkillsRoot())
    .find((entry) => entry.name === normalizeSkillName(existingSkillId));
  if (!manifest) {
    throw new Error(`Unknown skill for evolution: ${existingSkillId}`);
  }
  return skillManifestSchema.parse({
    ...manifest,
    version: '0.2.0',
    description: `${manifest.description} (evolved)`,
  });
};

export const proposeSkillEvolution = (input?: {
  projectId?: string;
  proposedBy?: string;
  targetSkill?: string;
}): ReturnType<typeof upsertSkillEvolutionProposal> => {
  const reflection = runReflectionCycle({ projectId: input?.projectId });
  const nudge = reflection.nudges[0] ?? {
    title: 'Memory assistant skill',
    description: 'Capture durable project and user memory retrieval patterns.',
    targetSkill: input?.targetSkill,
    severity: 'medium' as const,
  };
  const targetSkill = input?.targetSkill ?? nudge.targetSkill;
  const existingManifest = targetSkill
    ? discoverSkillManifests(resolveSkillsRoot())
      .find((entry) => entry.name === normalizeSkillName(targetSkill))
    : undefined;
  const normalizedName = normalizeSkillName(targetSkill ?? `evolved-${nudge.title}`);
  const manifest = existingManifest
    ? evolveSkill(targetSkill as string)
    : skillManifestSchema.parse({
      name: normalizedName,
      version: '0.1.0',
      description: nudge.description,
      capabilities: ['memory', 'reflection'],
      requiredBackends: ['apple-intelligence', 'mlx', 'local-llama', 'openmythos'],
      droidspeakVerbs: [
        {
          code: `EVT-SKILL-${normalizedName.toUpperCase().replace(/-/g, '_')}`,
          label: `${normalizedName} skill activity`,
        },
      ],
      projectScoped: false,
      affectsCoreBehavior: false,
      instructionsFile: 'SKILL.md',
      entry: 'index.ts',
    });
  const stubFiles = buildEvolutionStub(manifest.name, nudge.description);
  const consensus = runConsensusRound({
    proposalType: 'skill-registration',
    title: nudge.title,
    summary: nudge.description,
    glyph: 'EVT-SKILL-REGISTERED',
    context: {
      eventType: 'skill.register',
      actorRole: 'planner',
      swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
      projectId: input?.projectId ?? process.env.DROIDSWARM_PROJECT_ID,
      auditLoggingEnabled: true,
      dashboardEnabled: false,
      droidspeakState: {
        compact: 'EVT-SKILL-REGISTERED',
        expanded: nudge.description,
        kind: 'memory_pinned',
      },
    },
  });
  const proposal = upsertSkillEvolutionProposal({
    proposalId: randomUUID(),
    projectId: input?.projectId ?? process.env.DROIDSWARM_PROJECT_ID,
    proposalType: existingManifest ? 'update-skill' : 'new-skill',
    targetSkill: existingManifest ? targetSkill : undefined,
    title: nudge.title,
    description: nudge.description,
    rationale: `Derived from reflection cycle over ${reflection.analyzedCount} procedural memories.`,
    proposedBy: input?.proposedBy ?? 'reflection-engine',
    status: consensus.approved ? 'pending-human-approval' : 'rejected',
    manifest,
    stubFiles,
    consensusId: consensus.consensusId,
    auditHash: consensus.auditHash,
  });
  createLongTermMemory({
    projectId: proposal.projectId,
    memoryType: 'pattern',
    droidspeakSummary: `memory:pinned ${proposal.title}`,
    englishTranslation: proposal.description,
    relevanceScore: 0.8,
    metadata: {
      kind: 'skill-evolution-proposal',
      proposalId: proposal.proposalId,
    },
  });
  appendAuditEvent('SKILL_EVOLUTION_PROPOSED', {
    proposalId: proposal.proposalId,
    status: proposal.status,
    targetSkill: proposal.targetSkill,
  });
  return proposal;
};

export const listEvolutionProposals = (projectId?: string) =>
  listSkillEvolutionProposals(projectId ? { projectId } : undefined);

export const approveEvolutionProposal = (proposalId: string): ReturnType<typeof upsertSkillEvolutionProposal> => {
  const proposal = getSkillEvolutionProposal(proposalId);
  if (!proposal) {
    throw new Error(`Unknown proposal: ${proposalId}`);
  }
  const root = resolveSkillsRoot();
  const skillDir = path.resolve(root, proposal.manifest.name as string);
  if (!fs.existsSync(skillDir)) {
    createSkillScaffold({
      rootDir: root,
      name: String(proposal.manifest.name),
      template: 'custom',
    });
  }
  for (const [fileName, content] of Object.entries(proposal.stubFiles)) {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.resolve(skillDir, fileName), content);
  }
  appendAuditEvent('SKILL_EVOLUTION_APPROVED', {
    proposalId,
    skill: proposal.manifest.name,
  });
  return upsertSkillEvolutionProposal({
    proposalId: proposal.proposalId,
    projectId: proposal.projectId,
    proposalType: proposal.proposalType,
    targetSkill: proposal.targetSkill,
    title: proposal.title,
    description: proposal.description,
    rationale: proposal.rationale,
    proposedBy: proposal.proposedBy,
    status: 'approved',
    manifest: proposal.manifest,
    stubFiles: proposal.stubFiles,
    consensusId: proposal.consensusId,
    auditHash: proposal.auditHash,
  });
};

export const getEvolutionStatus = (projectId?: string) => ({
  proposals: listEvolutionProposals(projectId),
  recentMemorySignals: listLongTermMemories({
    projectId,
    memoryType: 'pattern',
    limit: 10,
  }),
});
