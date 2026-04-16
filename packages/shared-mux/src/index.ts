import type { TaskScope } from '@shared-types';

export interface WorkspaceLease {
  workspaceId: string;
  path: string;
  muxSessionId: string;
}

export const allocateWorkspaceLease = (scope: TaskScope): WorkspaceLease => ({
  workspaceId: scope.workspaceId ?? `workspace-${Date.now()}`,
  path: `${scope.rootPath}/.droidswarm/workspaces/${scope.workspaceId ?? 'default'}`,
  muxSessionId: `mux-${Date.now()}`,
});
