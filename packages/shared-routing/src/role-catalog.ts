import type { ModelTier } from '@shared-types';

export type SwarmRole =
  | 'planner'
  | 'researcher'
  | 'repo-scanner'
  | 'summarizer'
  | 'reviewer'
  | 'verifier'
  | 'checkpoint-compressor'
  | 'implementation-helper'
  | 'bugfix-helper'
  | 'apple-specialist'
  | 'arbiter';

export interface SwarmRoleDefinition {
  id: SwarmRole;
  aliases: string[];
  defaultModelTier: ModelTier;
  allowedTools: string[];
  expectedOutputs: string[];
  allowParallelInstances: boolean;
  verificationRequired: boolean;
  spawnHeuristics: string[];
}

const ROLE_CATALOG: Record<SwarmRole, SwarmRoleDefinition> = {
  planner: {
    id: 'planner',
    aliases: ['planner', 'plan', 'orchestrator'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'search', 'plan'],
    expectedOutputs: ['task plan', 'spawn requests', 'risk summary'],
    allowParallelInstances: false,
    verificationRequired: false,
    spawnHeuristics: ['new root task', 'unclear execution plan', 'handoff synthesis needed'],
  },
  researcher: {
    id: 'researcher',
    aliases: ['researcher', 'research'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'search', 'summarize'],
    expectedOutputs: ['findings summary', 'open questions', 'source-backed notes'],
    allowParallelInstances: true,
    verificationRequired: false,
    spawnHeuristics: ['many unresolved questions', 'external API uncertainty', 'domain investigation needed'],
  },
  'repo-scanner': {
    id: 'repo-scanner',
    aliases: ['repo-scanner', 'scanner', 'scan'],
    defaultModelTier: 'local-capable',
    allowedTools: ['read', 'search', 'index'],
    expectedOutputs: ['codebase map', 'relevant file set', 'dependency summary'],
    allowParallelInstances: true,
    verificationRequired: false,
    spawnHeuristics: ['large repo', 'unclear ownership boundaries', 'many candidate files'],
  },
  summarizer: {
    id: 'summarizer',
    aliases: ['summarizer', 'summary'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'summarize', 'compress'],
    expectedOutputs: ['summary update', 'digest refresh', 'context reduction'],
    allowParallelInstances: true,
    verificationRequired: false,
    spawnHeuristics: ['context growth', 'many sibling results', 'handoff compression needed'],
  },
  reviewer: {
    id: 'reviewer',
    aliases: ['reviewer', 'review', 'critic'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'search', 'review'],
    expectedOutputs: ['risk review', 'change critique', 'approval recommendation'],
    allowParallelInstances: true,
    verificationRequired: true,
    spawnHeuristics: ['high-risk changes', 'conflicting outputs', 'review gate triggered'],
  },
  verifier: {
    id: 'verifier',
    aliases: ['verifier', 'tester', 'test', 'qa'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'run-tests', 'verify'],
    expectedOutputs: ['verification result', 'failure report', 'confidence update'],
    allowParallelInstances: true,
    verificationRequired: false,
    spawnHeuristics: ['completion gate', 'artifact verification', 'regression confirmation'],
  },
  'checkpoint-compressor': {
    id: 'checkpoint-compressor',
    aliases: ['checkpoint-compressor', 'compressor', 'checkpoint', 'compress'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'summarize', 'compress'],
    expectedOutputs: ['checkpoint summary', 'digest refresh', 'pinned memory update'],
    allowParallelInstances: true,
    verificationRequired: false,
    spawnHeuristics: ['long task context', 'resume preparation', 'pre-handoff compression'],
  },
  'implementation-helper': {
    id: 'implementation-helper',
    aliases: ['implementation-helper', 'coder', 'coder-backend', 'coder-frontend', 'developer', 'dev', 'feature'],
    defaultModelTier: 'local-capable',
    allowedTools: ['read', 'edit', 'run-tests'],
    expectedOutputs: ['code change', 'artifact update', 'implementation summary'],
    allowParallelInstances: false,
    verificationRequired: true,
    spawnHeuristics: ['concrete code change needed', 'bounded implementation slice', 'non-Apple feature work'],
  },
  'bugfix-helper': {
    id: 'bugfix-helper',
    aliases: ['bugfix-helper', 'bugfix', 'bug'],
    defaultModelTier: 'local-capable',
    allowedTools: ['read', 'edit', 'run-tests', 'debug'],
    expectedOutputs: ['bug reproduction', 'fix summary', 'regression notes'],
    allowParallelInstances: false,
    verificationRequired: true,
    spawnHeuristics: ['bug triage', 'runtime failure', 'regression investigation'],
  },
  'apple-specialist': {
    id: 'apple-specialist',
    aliases: ['apple-specialist', 'coder-ios', 'ios', 'macos', 'swift', 'swiftui', 'visionos', 'xcode'],
    defaultModelTier: 'local-capable',
    allowedTools: ['read', 'edit', 'run-tests', 'apple-sdk'],
    expectedOutputs: ['Apple platform implementation', 'project config changes', 'platform notes'],
    allowParallelInstances: false,
    verificationRequired: true,
    spawnHeuristics: ['Apple ecosystem work', 'Swift or Xcode changes', 'platform-specific routing'],
  },
  arbiter: {
    id: 'arbiter',
    aliases: ['arbiter', 'comparison-reviewer', 'comparison', 'merge-reviewer'],
    defaultModelTier: 'local-cheap',
    allowedTools: ['read', 'compare', 'summarize'],
    expectedOutputs: ['agreement summary', 'disagreement summary', 'winner recommendation', 'follow-up action'],
    allowParallelInstances: false,
    verificationRequired: false,
    spawnHeuristics: ['parallel outputs disagree', 'same-role conflict', 'human escalation preparation'],
  },
};

const matchAlias = (normalizedRole: string, definition: SwarmRoleDefinition): boolean =>
  definition.aliases.some((alias) => normalizedRole === alias || normalizedRole.includes(alias));

export const normalizeSwarmRole = (role: string): SwarmRole => {
  const normalizedRole = role.trim().toLowerCase();
  for (const definition of Object.values(ROLE_CATALOG)) {
    if (matchAlias(normalizedRole, definition)) {
      return definition.id;
    }
  }
  return 'implementation-helper';
};

export const getSwarmRoleDefinition = (role: string): SwarmRoleDefinition =>
  ROLE_CATALOG[normalizeSwarmRole(role)];

export const listSwarmRoleDefinitions = (): SwarmRoleDefinition[] =>
  Object.values(ROLE_CATALOG);
