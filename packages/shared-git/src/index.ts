import type { GitPolicy } from '@shared-types';

export const defaultGitPolicy: GitPolicy = {
  mainBranch: 'main',
  developBranch: 'develop',
  prefixes: {
    feature: 'feature/',
    hotfix: 'hotfix/',
    release: 'release/',
    support: 'support/',
  },
};

const branchRegex = {
  feature: /^feature\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  hotfix: /^hotfix\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  release: /^release\/[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  support: /^support\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

export const resolveExpectedBaseBranch = (branch: string, policy: GitPolicy = defaultGitPolicy): string | null => {
  if (branch.startsWith(policy.prefixes.feature) || branch.startsWith(policy.prefixes.release)) {
    return policy.developBranch;
  }
  if (branch.startsWith(policy.prefixes.hotfix) || branch.startsWith(policy.prefixes.support)) {
    return policy.mainBranch;
  }
  return null;
};

export const validateGitFlowBranch = (branch: string, baseBranch?: string, policy: GitPolicy = defaultGitPolicy): {
  valid: boolean;
  reason?: string;
} => {
  const kind = Object.entries(policy.prefixes).find(([, prefix]) => branch.startsWith(prefix))?.[0] as keyof typeof branchRegex | undefined;
  if (!kind) {
    return { valid: false, reason: 'Branch must use a configured git-flow prefix.' };
  }

  if (!branchRegex[kind].test(branch)) {
    return { valid: false, reason: `Branch ${branch} does not satisfy the ${kind} naming rule.` };
  }

  const expectedBase = resolveExpectedBaseBranch(branch, policy);
  if (expectedBase && baseBranch && expectedBase !== baseBranch) {
    return { valid: false, reason: `Branch ${branch} must be created from ${expectedBase}, received ${baseBranch}.` };
  }

  return { valid: true };
};
