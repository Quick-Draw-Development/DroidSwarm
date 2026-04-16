import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { allocateWorkspaceLease } from '@shared-mux';
import type { OrchestratorConfig, PersistedTask, TaskAttemptRecord } from '../types';

export interface WorkspaceLeaseRecord {
  workspaceId: string;
  path: string;
  branch: string;
  rootPath: string;
  readOnly: boolean;
  muxSessionId: string;
}

export class WorkspaceService {
  constructor(private readonly config: OrchestratorConfig) {}

  ensureWorkspace(task: PersistedTask, attemptId: string, branch: string, readOnly: boolean): WorkspaceLeaseRecord {
    const rootPath = task.rootPath ?? this.config.projectRoot;
    const workspaceId = task.workspaceId ?? attemptId;
    const lease = allocateWorkspaceLease({
      projectId: task.projectId ?? this.config.projectId,
      repoId: task.repoId ?? this.config.repoId,
      rootPath,
      branch,
      workspaceId,
    });
    const workspacePath = path.resolve(this.config.workspaceRoot, lease.workspaceId);

    fs.mkdirSync(this.config.workspaceRoot, { recursive: true });
    if (!fs.existsSync(workspacePath)) {
      this.createWorkspace(rootPath, workspacePath, branch, readOnly);
    }

    return {
      workspaceId: lease.workspaceId,
      path: workspacePath,
      branch,
      rootPath,
      readOnly,
      muxSessionId: lease.muxSessionId,
    };
  }

  restoreWorkspace(attempt: TaskAttemptRecord): WorkspaceLeaseRecord | null {
    if (!attempt.workspaceId || !attempt.rootPath || !attempt.branch) {
      return null;
    }
    const workspacePath = path.resolve(this.config.workspaceRoot, attempt.workspaceId);
    if (!fs.existsSync(workspacePath)) {
      return null;
    }
    return {
      workspaceId: attempt.workspaceId,
      path: workspacePath,
      branch: attempt.branch,
      rootPath: attempt.rootPath,
      readOnly: Boolean(attempt.metadata?.read_only),
      muxSessionId: typeof attempt.metadata?.mux_session_id === 'string' ? attempt.metadata.mux_session_id : `mux-${attempt.workspaceId}`,
    };
  }

  private createWorkspace(rootPath: string, workspacePath: string, branch: string, readOnly: boolean): void {
    const gitDir = path.join(rootPath, '.git');
    if (path.resolve(rootPath) === path.parse(path.resolve(rootPath)).root) {
      fs.mkdirSync(workspacePath, { recursive: true });
      return;
    }
    if (fs.existsSync(gitDir)) {
      const args = ['-C', rootPath, 'worktree', 'add'];
      if (readOnly) {
        args.push('--detach');
      } else {
        args.push('-B', branch, workspacePath, branch);
      }
      if (readOnly) {
        args.push(workspacePath, branch);
      }
      execFileSync('git', args, { stdio: 'ignore' });
      return;
    }

    if (workspacePath.startsWith(path.resolve(rootPath))) {
      fs.mkdirSync(workspacePath, { recursive: true });
      return;
    }
    fs.cpSync(rootPath, workspacePath, { recursive: true });
  }
}
