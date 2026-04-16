import path from 'node:path';
import type { RepoTarget, TaskScope } from '@shared-types';

export const isPathWithinAllowedRoots = (candidatePath: string, roots: string[]): boolean => {
  const normalizedCandidate = path.resolve(candidatePath);
  return roots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
  });
};

export const assertScopeWithinRepo = (scope: TaskScope, repo: Pick<RepoTarget, 'allowedRoots' | 'repoId'>): void => {
  if (scope.repoId !== repo.repoId) {
    throw new Error(`Scope repo ${scope.repoId} does not match repo target ${repo.repoId}.`);
  }
  if (!isPathWithinAllowedRoots(scope.rootPath, repo.allowedRoots)) {
    throw new Error(`Root path ${scope.rootPath} is outside the repo allowlist.`);
  }
};

export const resolveWorkspacePath = (scope: TaskScope): string => scope.workspaceId
  ? path.join(scope.rootPath, '.droidswarm', 'workspaces', scope.workspaceId)
  : scope.rootPath;
