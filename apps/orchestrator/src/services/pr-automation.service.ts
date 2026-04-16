import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import type { OrchestratorConfig, PersistedTask } from '../types';

export class PRAutomationService {
  constructor(private readonly config: OrchestratorConfig) {}

  ensureBranch(rootPath: string, branch: string, baseBranch: string): void {
    if (!fs.existsSync(`${rootPath}/.git`) && !fs.existsSync(rootPath)) {
      return;
    }
    if (!fs.existsSync(`${rootPath}/.git`)) {
      return;
    }
    execFileSync('git', ['-C', rootPath, 'fetch', this.config.prRemoteName, baseBranch], { stdio: 'ignore' });
    execFileSync('git', ['-C', rootPath, 'checkout', '-B', branch, `${this.config.prRemoteName}/${baseBranch}`], { stdio: 'ignore' });
  }

  finalizeTask(task: PersistedTask, workspacePath: string): void {
    if (!this.config.prAutomationEnabled || !task.branch) {
      return;
    }
    execFileSync('git', ['-C', workspacePath, 'add', '-A'], { stdio: 'ignore' });
    try {
      execFileSync('git', ['-C', workspacePath, 'commit', '-m', `droidswarm: complete ${task.name}`], { stdio: 'ignore' });
    } catch {
      // No-op when there are no staged changes.
    }
    try {
      execFileSync('git', ['-C', workspacePath, 'push', '-u', this.config.prRemoteName, task.branch], { stdio: 'ignore' });
    } catch {
      return;
    }

    if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
      const baseBranch = task.branch.startsWith(this.config.gitPolicy.prefixes.feature) || task.branch.startsWith(this.config.gitPolicy.prefixes.release)
        ? this.config.gitPolicy.developBranch
        : this.config.gitPolicy.mainBranch;
      try {
        execFileSync('gh', [
          'pr',
          'create',
          '--repo',
          process.env.DROIDSWARM_PR_REPO ?? '',
          '--base',
          baseBranch,
          '--head',
          task.branch,
          '--title',
          `DroidSwarm: ${task.name}`,
          '--body',
          `Automated PR for task ${task.taskId}`,
        ].filter(Boolean), { stdio: 'ignore' });
      } catch {
        // Leave pushed branch in place when PR creation is unavailable.
      }
    }
  }
}
