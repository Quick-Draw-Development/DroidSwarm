import { z } from 'zod';

export const skillVerbSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});

export const modelPreferencesSchema = z.object({
  backend: z.enum(['apple-intelligence', 'mlx', 'local-llama', 'openmythos']).optional(),
  reasoningDepth: z.enum(['low', 'medium', 'high']).optional(),
  minContextLength: z.number().int().positive().optional(),
  toolUse: z.boolean().optional(),
  speedPriority: z.enum(['latency', 'balanced', 'throughput']).optional(),
  tags: z.array(z.string()).default([]),
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
  modelPreferences: modelPreferencesSchema.optional(),
});

export const agentManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).default('0.1.0'),
  description: z.string().min(1),
  type: z.enum(['specialized', 'persistent-loop']).default('specialized'),
  skills: z.array(z.string().min(1)).min(1),
  capabilities: z.array(z.string()).default([]),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  projectScoped: z.boolean().default(false),
  affectsCoreBehavior: z.boolean().default(false),
  modelRouting: z.object({
    preferredBackend: z.string().optional(),
    modelTier: z.string().optional(),
  }).default({}),
  modelPreferences: modelPreferencesSchema.optional(),
  consensusRoles: z.array(z.enum(['proposer', 'reviewer', 'verifier', 'guardian', 'arbitrator'])).default(['proposer', 'reviewer', 'verifier']),
  governanceParticipation: z.enum(['observer', 'participant', 'guardian']).default('participant'),
  resourceQuotas: z.object({
    maxConcurrentTasks: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
  }).default({}),
  loopConfig: z.object({
    maxIterations: z.number().int().positive(),
    completionSignal: z.string().min(1),
    sleepMs: z.number().int().nonnegative(),
  }).optional(),
});

export type SkillVerbManifest = z.infer<typeof skillVerbSchema>;
export type ModelPreferencesManifest = z.infer<typeof modelPreferencesSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type AgentManifest = z.infer<typeof agentManifestSchema>;
