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

export interface FederatedNodeRecord {
  nodeId: string;
  swarmRole: 'master' | 'slave';
  host?: string;
  busUrl?: string;
  adminUrl?: string;
  projectId?: string;
  status: 'active' | 'kicked' | 'rejected';
  version?: string;
  publicKey?: string;
  rulesHash?: string;
  hardwareFingerprintHash?: string;
  capabilities: string[];
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  kickedAt?: string;
}

export interface RegisterFederatedNodeInput {
  nodeId: string;
  swarmRole: FederatedNodeRecord['swarmRole'];
  host?: string;
  busUrl?: string;
  adminUrl?: string;
  projectId?: string;
  status?: FederatedNodeRecord['status'];
  version?: string;
  publicKey?: string;
  rulesHash?: string;
  hardwareFingerprintHash?: string;
  capabilities?: string[];
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

    CREATE TABLE IF NOT EXISTS federated_nodes (
      node_id TEXT PRIMARY KEY,
      swarm_role TEXT NOT NULL,
      host TEXT,
      bus_url TEXT,
      admin_url TEXT,
      project_id TEXT,
      status TEXT NOT NULL,
      version TEXT,
      public_key TEXT,
      rules_hash TEXT,
      hardware_fingerprint_hash TEXT,
      capabilities_json TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      kicked_at TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_federated_nodes_project
      ON federated_nodes(project_id, updated_at DESC);
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

const normalizeNodeRecord = (row: Record<string, unknown>): FederatedNodeRecord => ({
  nodeId: String(row.node_id),
  swarmRole: row.swarm_role === 'slave' ? 'slave' : 'master',
  host: typeof row.host === 'string' ? row.host : undefined,
  busUrl: typeof row.bus_url === 'string' ? row.bus_url : undefined,
  adminUrl: typeof row.admin_url === 'string' ? row.admin_url : undefined,
  projectId: typeof row.project_id === 'string' ? row.project_id : undefined,
  status: row.status === 'kicked' ? 'kicked' : row.status === 'rejected' ? 'rejected' : 'active',
  version: typeof row.version === 'string' ? row.version : undefined,
  publicKey: typeof row.public_key === 'string' ? row.public_key : undefined,
  rulesHash: typeof row.rules_hash === 'string' ? row.rules_hash : undefined,
  hardwareFingerprintHash:
    typeof row.hardware_fingerprint_hash === 'string' ? row.hardware_fingerprint_hash : undefined,
  capabilities: (() => {
    try {
      const parsed = JSON.parse(String(row.capabilities_json ?? '[]')) as unknown;
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  })(),
  lastSeenAt: String(row.last_seen_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  kickedAt: typeof row.kicked_at === 'string' ? row.kicked_at : undefined,
});

export const registerFederatedNode = (input: RegisterFederatedNodeInput, dbPath?: string): FederatedNodeRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const record = {
      nodeId: input.nodeId,
      swarmRole: input.swarmRole,
      host: input.host ?? null,
      busUrl: input.busUrl ?? null,
      adminUrl: input.adminUrl ?? null,
      projectId: input.projectId ?? null,
      status: input.status ?? 'active',
      version: input.version ?? null,
      publicKey: input.publicKey ?? null,
      rulesHash: input.rulesHash ?? null,
      hardwareFingerprintHash: input.hardwareFingerprintHash ?? null,
      capabilitiesJson: JSON.stringify(input.capabilities ?? []),
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      kickedAt: input.status === 'kicked' ? now : null,
    };

    database.prepare(`
      INSERT INTO federated_nodes (
        node_id, swarm_role, host, bus_url, admin_url, project_id, status, version, public_key,
        rules_hash, hardware_fingerprint_hash, capabilities_json, last_seen_at, created_at, updated_at, kicked_at
      ) VALUES (
        @nodeId, @swarmRole, @host, @busUrl, @adminUrl, @projectId, @status, @version, @publicKey,
        @rulesHash, @hardwareFingerprintHash, @capabilitiesJson, @lastSeenAt, @createdAt, @updatedAt, @kickedAt
      )
      ON CONFLICT(node_id) DO UPDATE SET
        swarm_role = excluded.swarm_role,
        host = excluded.host,
        bus_url = excluded.bus_url,
        admin_url = excluded.admin_url,
        project_id = excluded.project_id,
        status = excluded.status,
        version = excluded.version,
        public_key = excluded.public_key,
        rules_hash = excluded.rules_hash,
        hardware_fingerprint_hash = excluded.hardware_fingerprint_hash,
        capabilities_json = excluded.capabilities_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at,
        kicked_at = excluded.kicked_at
    `).run(record);

    const row = database.prepare(`SELECT * FROM federated_nodes WHERE node_id = ? LIMIT 1`).get(input.nodeId) as Record<string, unknown>;
    return normalizeNodeRecord(row);
  } finally {
    database.close();
  }
};

export const listFederatedNodes = (input?: { projectId?: string; status?: FederatedNodeRecord['status'] }, dbPath?: string): FederatedNodeRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input?.projectId) {
      clauses.push(`project_id = ?`);
      values.push(input.projectId);
    }
    if (input?.status) {
      clauses.push(`status = ?`);
      values.push(input.status);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return (database.prepare(`
      SELECT *
      FROM federated_nodes
      ${whereClause}
      ORDER BY updated_at DESC, node_id ASC
    `).all(...values) as Record<string, unknown>[])
      .map(normalizeNodeRecord);
  } finally {
    database.close();
  }
};

export const getFederatedNode = (nodeId: string, dbPath?: string): FederatedNodeRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`SELECT * FROM federated_nodes WHERE node_id = ? LIMIT 1`).get(nodeId) as Record<string, unknown> | undefined;
    return row ? normalizeNodeRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const markFederatedNodeKicked = (nodeId: string, dbPath?: string): FederatedNodeRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE federated_nodes
      SET status = 'kicked',
          kicked_at = ?,
          updated_at = ?
      WHERE node_id = ?
    `).run(now, now, nodeId);
    const row = database.prepare(`SELECT * FROM federated_nodes WHERE node_id = ? LIMIT 1`).get(nodeId) as Record<string, unknown> | undefined;
    return row ? normalizeNodeRecord(row) : undefined;
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
