import { defaultGitPolicy, resolveExpectedBaseBranch, validateGitFlowBranch } from '@shared-git';
import type { GitPolicy } from '../types';

export class BranchPolicyService {
  constructor(private readonly policy: GitPolicy = defaultGitPolicy) {}

  validateWriteScope(input: {
    projectId?: string;
    repoId?: string;
    rootPath?: string;
    branch?: string;
    baseBranch?: string;
    workspaceId?: string;
  }): void {
    if (!input.projectId || !input.repoId || !input.rootPath || !input.branch) {
      throw new Error('Write-capable attempts require project_id, repo_id, root_path, and branch.');
    }
    const validation = validateGitFlowBranch(input.branch, input.baseBranch, this.policy);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
  }

  expectedBaseBranch(branch: string): string | null {
    return resolveExpectedBaseBranch(branch, this.policy);
  }
}
