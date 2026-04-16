import path from 'node:path';
import type { GitPolicy } from '@shared-types';
import { defaultGitPolicy } from '@shared-git';

export interface SharedConfig {
  projectId: string;
  dbPath: string;
  socketUrl: string;
  skillsDir: string;
  gitPolicy: GitPolicy;
}

export const loadSharedConfig = (): SharedConfig => ({
  projectId: process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
  dbPath: process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db'),
  socketUrl: process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765',
  skillsDir: process.env.DROIDSWARM_SKILLS_DIR ?? path.resolve(process.cwd(), 'skills'),
  gitPolicy: defaultGitPolicy,
});
