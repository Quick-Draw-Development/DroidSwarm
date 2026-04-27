import { z } from 'zod';

export const skillVerbSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});

export const skillManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).default('0.1.0'),
  description: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  requiredBackends: z.array(z.string()).default([]),
  droidspeakVerbs: z.array(skillVerbSchema).default([]),
  projectScoped: z.boolean().default(false),
  affectsCoreBehavior: z.boolean().default(false),
  entry: z.string().optional(),
  instructionsFile: z.string().optional(),
});

export const agentManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).default('0.1.0'),
  description: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  projectScoped: z.boolean().default(false),
  affectsCoreBehavior: z.boolean().default(false),
  modelRouting: z.object({
    preferredBackend: z.string().optional(),
    modelTier: z.string().optional(),
  }).default({}),
  consensusRoles: z.array(z.enum(['proposer', 'reviewer', 'verifier', 'guardian', 'arbitrator'])).default(['proposer', 'reviewer', 'verifier']),
  governanceParticipation: z.enum(['observer', 'participant', 'guardian']).default('participant'),
  resourceQuotas: z.object({
    maxConcurrentTasks: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
  }).default({}),
});

export type SkillVerbManifest = z.infer<typeof skillVerbSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type AgentManifest = z.infer<typeof agentManifestSchema>;
