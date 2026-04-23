import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import Database from 'better-sqlite3';
import type { RepoTarget, TaskScope } from '@shared-types';

export interface ProjectRegistryRecord {
  projectId: string;
  name: string;
  rootPath: string;
  gitRemote?: string;
  gitCommitHash?: string;
  onboardedAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
  dbPath: string;
  dashboardPort?: number;
  wsPort?: number;
}

export interface OnboardProjectInput {
  projectId: string;
  name: string;
  rootPath: string;
  gitRemote?: string;
  gitCommitHash?: string;
  status?: ProjectRegistryRecord['status'];
  dbPath?: string;
  dashboardPort?: number;
  wsPort?: number;
}

export interface CurrentProjectSelection {
  projectId: string;
  selectedAt: string;
}

export const resolveDroidSwarmHome = (): string =>
  process.env.DROIDSWARM_HOME ?? path.resolve(process.env.HOME ?? process.cwd(), '.droidswarm');

export const resolveProjectRegistryDbPath = (): string =>
  process.env.DROIDSWARM_REGISTRY_DB_PATH ?? path.resolve(resolveDroidSwarmHome(), 'registry.db');

export const resolveCurrentProjectFile = (): string =>
  process.env.DROIDSWARM_CURRENT_PROJECT_FILE ?? path.resolve(resolveDroidSwarmHome(), 'current-project.json');

export const resolveProjectDataDir = (projectId: string): string =>
  path.resolve(resolveDroidSwarmHome(), 'projects', projectId);

export const resolveProjectDbPath = (projectId: string): string =>
  path.resolve(resolveProjectDataDir(projectId), 'droidswarm.db');

const ensureDirectory = (target: string): void => {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
};

export const openProjectRegistryDatabase = (dbPath = resolveProjectRegistryDbPath()): Database.Database => {
  ensureDirectory(path.dirname(dbPath));
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      git_remote TEXT,
      git_commit_hash TEXT,
      onboarded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      db_path TEXT NOT NULL,
      dashboard_port INTEGER,
      ws_port INTEGER
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_projects_name
      ON projects(name);
  `);
  return database;
};

const normalizeRecord = (row: Record<string, unknown>): ProjectRegistryRecord => ({
  projectId: String(row.project_id),
  name: String(row.name),
  rootPath: String(row.root_path),
  gitRemote: typeof row.git_remote === 'string' ? row.git_remote : undefined,
  gitCommitHash: typeof row.git_commit_hash === 'string' ? row.git_commit_hash : undefined,
  onboardedAt: String(row.onboarded_at),
  updatedAt: String(row.updated_at),
  status: row.status === 'archived' ? 'archived' : 'active',
  dbPath: String(row.db_path),
  dashboardPort: typeof row.dashboard_port === 'number' ? row.dashboard_port : undefined,
  wsPort: typeof row.ws_port === 'number' ? row.ws_port : undefined,
});

export const listRegisteredProjects = (dbPath?: string): ProjectRegistryRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    return (database.prepare(`
      SELECT *
      FROM projects
      ORDER BY updated_at DESC, name ASC
    `).all() as Record<string, unknown>[])
      .map(normalizeRecord);
  } finally {
    database.close();
  }
};

export const getRegisteredProject = (
  lookup: {
    projectId?: string;
    name?: string;
    rootPath?: string;
  },
  dbPath?: string,
): ProjectRegistryRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    if (lookup.projectId) {
      const row = database.prepare(`SELECT * FROM projects WHERE project_id = ? LIMIT 1`).get(lookup.projectId) as Record<string, unknown> | undefined;
      return row ? normalizeRecord(row) : undefined;
    }
    if (lookup.name) {
      const row = database.prepare(`SELECT * FROM projects WHERE name = ? LIMIT 1`).get(lookup.name) as Record<string, unknown> | undefined;
      return row ? normalizeRecord(row) : undefined;
    }
    if (lookup.rootPath) {
      const row = database.prepare(`SELECT * FROM projects WHERE root_path = ? LIMIT 1`).get(path.resolve(lookup.rootPath)) as Record<string, unknown> | undefined;
      return row ? normalizeRecord(row) : undefined;
    }
    return undefined;
  } finally {
    database.close();
  }
};

export const onboardProject = (input: OnboardProjectInput, dbPath?: string): ProjectRegistryRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const normalizedRoot = path.resolve(input.rootPath);
    const record: ProjectRegistryRecord = {
      projectId: input.projectId,
      name: input.name,
      rootPath: normalizedRoot,
      gitRemote: input.gitRemote,
      gitCommitHash: input.gitCommitHash,
      onboardedAt: now,
      updatedAt: now,
      status: input.status ?? 'active',
      dbPath: input.dbPath ?? resolveProjectDbPath(input.projectId),
      dashboardPort: input.dashboardPort,
      wsPort: input.wsPort,
    };

    database.prepare(`
      INSERT INTO projects (
        project_id, name, root_path, git_remote, git_commit_hash, onboarded_at, updated_at, status, db_path, dashboard_port, ws_port
      ) VALUES (
        @projectId, @name, @rootPath, @gitRemote, @gitCommitHash, @onboardedAt, @updatedAt, @status, @dbPath, @dashboardPort, @wsPort
      )
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        root_path = excluded.root_path,
        git_remote = excluded.git_remote,
        git_commit_hash = excluded.git_commit_hash,
        updated_at = excluded.updated_at,
        status = excluded.status,
        db_path = excluded.db_path,
        dashboard_port = excluded.dashboard_port,
        ws_port = excluded.ws_port
    `).run(record);
    ensureDirectory(path.dirname(record.dbPath));
    return record;
  } finally {
    database.close();
  }
};

export const removeRegisteredProject = (projectId: string, dbPath?: string): boolean => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const result = database.prepare(`DELETE FROM projects WHERE project_id = ?`).run(projectId);
    return result.changes > 0;
  } finally {
    database.close();
  }
};

export const setCurrentProject = (projectId: string, filePath = resolveCurrentProjectFile()): CurrentProjectSelection => {
  ensureDirectory(path.dirname(filePath));
  const selection: CurrentProjectSelection = {
    projectId,
    selectedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(selection, null, 2));
  return selection;
};

export const getCurrentProject = (filePath = resolveCurrentProjectFile()): CurrentProjectSelection | undefined => {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<CurrentProjectSelection>;
    if (typeof raw.projectId !== 'string' || typeof raw.selectedAt !== 'string') {
      return undefined;
    }
    return {
      projectId: raw.projectId,
      selectedAt: raw.selectedAt,
    };
  } catch {
    return undefined;
  }
};

export const resolveProjectLookup = (nameOrPathOrId?: string, dbPath?: string): ProjectRegistryRecord | undefined => {
  if (!nameOrPathOrId) {
    const current = getCurrentProject();
    return current ? getRegisteredProject({ projectId: current.projectId }, dbPath) : undefined;
  }

  const byId = getRegisteredProject({ projectId: nameOrPathOrId }, dbPath);
  if (byId) {
    return byId;
  }
  const byName = getRegisteredProject({ name: nameOrPathOrId }, dbPath);
  if (byName) {
    return byName;
  }
  return getRegisteredProject({ rootPath: nameOrPathOrId }, dbPath);
};

const tryGit = (rootPath: string, ...args: string[]): string | undefined => {
  try {
    return execFileSync('git', ['-C', rootPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
};

export const detectProjectMetadata = (rootPath: string): Omit<OnboardProjectInput, 'projectId'> => {
  const normalizedRoot = path.resolve(rootPath);
  const packageJsonPath = path.join(normalizedRoot, 'package.json');
  const packageName = (() => {
    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string };
      return typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : undefined;
    } catch {
      return undefined;
    }
  })();
  const gitRemote = tryGit(normalizedRoot, 'remote', 'get-url', 'origin');
  const gitCommitHash = tryGit(normalizedRoot, 'rev-parse', 'HEAD');
  const gitTopLevel = tryGit(normalizedRoot, 'rev-parse', '--show-toplevel') ?? normalizedRoot;
  const fallbackName = path.basename(gitTopLevel);
  const projectIdSource = (packageName ?? fallbackName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    name: packageName ?? fallbackName,
    rootPath: gitTopLevel,
    gitRemote,
    gitCommitHash,
    dbPath: resolveProjectDbPath(projectIdSource || 'droidswarm-project'),
  };
};

export const migrateLegacyProject = (oldPath: string, overrides?: Partial<OnboardProjectInput>): ProjectRegistryRecord => {
  const metadata = detectProjectMetadata(oldPath);
  const projectId = overrides?.projectId
    ?? metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    ?? 'droidswarm-project';
  return onboardProject({
    projectId,
    name: overrides?.name ?? metadata.name,
    rootPath: overrides?.rootPath ?? metadata.rootPath,
    gitRemote: overrides?.gitRemote ?? metadata.gitRemote,
    gitCommitHash: overrides?.gitCommitHash ?? metadata.gitCommitHash,
    status: overrides?.status ?? 'active',
    dbPath: overrides?.dbPath ?? path.resolve(oldPath, '.droidswarm', 'droidswarm.db'),
    dashboardPort: overrides?.dashboardPort,
    wsPort: overrides?.wsPort,
  });
};

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
