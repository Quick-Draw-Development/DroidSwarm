import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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

export interface RegisteredSkillRecord {
  name: string;
  version: string;
  description: string;
  hash: string;
  status: 'active' | 'pending-approval' | 'disabled' | 'failed';
  projectScoped: boolean;
  capabilities: string[];
  requiredBackends: string[];
  droidspeakVerbs: Array<{ code: string; label: string }>;
  manifest: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRegisteredSkillInput {
  name: string;
  version: string;
  description: string;
  status?: RegisteredSkillRecord['status'];
  projectScoped?: boolean;
  capabilities?: string[];
  requiredBackends?: string[];
  droidspeakVerbs?: Array<{ code: string; label: string }>;
  manifest: Record<string, unknown>;
}

export interface RegisteredAgentRecord {
  name: string;
  version: string;
  description: string;
  hash: string;
  status: 'active' | 'pending-approval' | 'disabled' | 'failed';
  projectScoped: boolean;
  skills: string[];
  priority: 'low' | 'medium' | 'high';
  preferredBackend?: string;
  modelTier?: string;
  governanceParticipation: 'observer' | 'participant' | 'guardian';
  consensusRoles: string[];
  resourceQuotas: Record<string, unknown>;
  manifest: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredModelRecord {
  nodeId: string;
  modelId: string;
  displayName: string;
  backend: 'apple-intelligence' | 'mlx' | 'local-llama';
  path?: string;
  quantization?: string;
  contextLength?: number;
  sizeBytes?: number;
  toolUse: boolean;
  reasoningDepth: 'low' | 'medium' | 'high';
  speedTier: 'fast' | 'balanced' | 'heavy';
  enabled: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  source:
    | 'local-scan'
    | 'bootstrap-inventory'
    | 'federation-sync'
    | 'manual'
    | 'huggingface-discovery'
    | 'local-ai-zone-discovery'
    | 'downloaded';
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRegisteredModelInput {
  nodeId: string;
  modelId: string;
  displayName: string;
  backend: RegisteredModelRecord['backend'];
  path?: string;
  quantization?: string;
  contextLength?: number;
  sizeBytes?: number;
  toolUse?: boolean;
  reasoningDepth?: RegisteredModelRecord['reasoningDepth'];
  speedTier?: RegisteredModelRecord['speedTier'];
  enabled?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  source?: RegisteredModelRecord['source'];
}

export interface ModelDiscoverySettingsRecord {
  scopeKey: string;
  projectId?: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRegisteredAgentInput {
  name: string;
  version: string;
  description: string;
  status?: RegisteredAgentRecord['status'];
  projectScoped?: boolean;
  skills: string[];
  priority?: RegisteredAgentRecord['priority'];
  preferredBackend?: string;
  modelTier?: string;
  governanceParticipation?: RegisteredAgentRecord['governanceParticipation'];
  consensusRoles?: string[];
  resourceQuotas?: Record<string, unknown>;
  manifest: Record<string, unknown>;
}

export interface SkillEvolutionProposalRecord {
  proposalId: string;
  projectId?: string;
  proposalType: 'new-skill' | 'update-skill';
  targetSkill?: string;
  title: string;
  description: string;
  rationale: string;
  proposedBy: string;
  status: 'pending-consensus' | 'pending-human-approval' | 'approved' | 'rejected';
  manifest: Record<string, unknown>;
  stubFiles: Record<string, string>;
  consensusId?: string;
  auditHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSkillEvolutionProposalInput {
  proposalId: string;
  projectId?: string;
  proposalType: SkillEvolutionProposalRecord['proposalType'];
  targetSkill?: string;
  title: string;
  description: string;
  rationale: string;
  proposedBy: string;
  status: SkillEvolutionProposalRecord['status'];
  manifest: Record<string, unknown>;
  stubFiles: Record<string, string>;
  consensusId?: string;
  auditHash?: string;
}

export interface CodeReviewRunRecord {
  reviewId: string;
  projectId: string;
  prId: string;
  title: string;
  status: 'pending' | 'clarification-needed' | 'completed' | 'failed';
  summary: string;
  backend?: string;
  reviewAgent?: string;
  repoRoot?: string;
  baseRef?: string;
  headRef?: string;
  findings: Array<Record<string, unknown>>;
  findingsMarkdown: string;
  consensusId?: string;
  auditHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCodeReviewRunInput {
  reviewId: string;
  projectId: string;
  prId: string;
  title: string;
  status: CodeReviewRunRecord['status'];
  summary: string;
  backend?: string;
  reviewAgent?: string;
  repoRoot?: string;
  baseRef?: string;
  headRef?: string;
  findings?: Array<Record<string, unknown>>;
  findingsMarkdown?: string;
  consensusId?: string;
  auditHash?: string;
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

const stableSerialize = (input: unknown): string => {
  if (input == null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};

const computeRegistryHash = (input: unknown): string =>
  createHash('sha256').update(stableSerialize(input)).digest('hex');

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

    CREATE TABLE IF NOT EXISTS skill_registry (
      name TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      description TEXT NOT NULL,
      hash TEXT NOT NULL,
      status TEXT NOT NULL,
      project_scoped INTEGER NOT NULL,
      capabilities_json TEXT NOT NULL,
      required_backends_json TEXT NOT NULL,
      droidspeak_verbs_json TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_skills_status
      ON skill_registry(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_registry (
      name TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      description TEXT NOT NULL,
      hash TEXT NOT NULL,
      status TEXT NOT NULL,
      project_scoped INTEGER NOT NULL,
      skills_json TEXT NOT NULL,
      priority TEXT NOT NULL,
      preferred_backend TEXT,
      model_tier TEXT,
      governance_participation TEXT NOT NULL,
      consensus_roles_json TEXT NOT NULL,
      resource_quotas_json TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_agents_status
      ON agent_registry(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS models (
      node_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      backend TEXT NOT NULL,
      path TEXT,
      quantization TEXT,
      context_length INTEGER,
      size_bytes INTEGER,
      tool_use INTEGER NOT NULL,
      reasoning_depth TEXT NOT NULL,
      speed_tier TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      tags_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      source TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (node_id, model_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_models_backend
      ON models(backend, enabled, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_registry_models_node
      ON models(node_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS model_discovery_settings (
      scope_key TEXT PRIMARY KEY,
      project_id TEXT,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_model_discovery_settings_project
      ON model_discovery_settings(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS skill_evolution_proposals (
      proposal_id TEXT PRIMARY KEY,
      project_id TEXT,
      proposal_type TEXT NOT NULL,
      target_skill TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      rationale TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      status TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      stub_files_json TEXT NOT NULL,
      consensus_id TEXT,
      audit_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_skill_evolution_proposals_project
      ON skill_evolution_proposals(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS code_review_runs (
      review_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      pr_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      backend TEXT,
      review_agent TEXT,
      repo_root TEXT,
      base_ref TEXT,
      head_ref TEXT,
      findings_json TEXT NOT NULL,
      findings_markdown TEXT NOT NULL,
      consensus_id TEXT,
      audit_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_registry_code_reviews_project
      ON code_review_runs(project_id, updated_at DESC);
  `);
  const ensureColumn = (tableName: string, columnName: string, definition: string): void => {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
    if (!columns.some((column) => column.name === columnName)) {
      database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  };
  ensureColumn('agent_registry', 'consensus_roles_json', `TEXT NOT NULL DEFAULT '[]'`);
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

const parseJsonArray = (value: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
};

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as unknown;
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeSkillRecord = (row: Record<string, unknown>): RegisteredSkillRecord => ({
  name: String(row.name),
  version: String(row.version),
  description: String(row.description),
  hash: String(row.hash),
  status:
    row.status === 'pending-approval'
      ? 'pending-approval'
      : row.status === 'disabled'
        ? 'disabled'
        : row.status === 'failed'
          ? 'failed'
          : 'active',
  projectScoped: Number(row.project_scoped ?? 0) === 1,
  capabilities: parseJsonArray(row.capabilities_json),
  requiredBackends: parseJsonArray(row.required_backends_json),
  droidspeakVerbs: (() => {
    try {
      const parsed = JSON.parse(String(row.droidspeak_verbs_json ?? '[]')) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is { code: string; label: string } =>
          entry != null
          && typeof entry === 'object'
          && typeof (entry as { code?: unknown }).code === 'string'
          && typeof (entry as { label?: unknown }).label === 'string')
        : [];
    } catch {
      return [];
    }
  })(),
  manifest: parseJsonObject(row.manifest_json),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const normalizeAgentRecord = (row: Record<string, unknown>): RegisteredAgentRecord => ({
  name: String(row.name),
  version: String(row.version),
  description: String(row.description),
  hash: String(row.hash),
  status:
    row.status === 'pending-approval'
      ? 'pending-approval'
      : row.status === 'disabled'
        ? 'disabled'
        : row.status === 'failed'
          ? 'failed'
          : 'active',
  projectScoped: Number(row.project_scoped ?? 0) === 1,
  skills: parseJsonArray(row.skills_json),
  priority: row.priority === 'low' ? 'low' : row.priority === 'high' ? 'high' : 'medium',
  preferredBackend: typeof row.preferred_backend === 'string' ? row.preferred_backend : undefined,
  modelTier: typeof row.model_tier === 'string' ? row.model_tier : undefined,
  governanceParticipation:
    row.governance_participation === 'observer'
      ? 'observer'
      : row.governance_participation === 'guardian'
        ? 'guardian'
        : 'participant',
  consensusRoles: parseJsonArray(row.consensus_roles_json),
  resourceQuotas: parseJsonObject(row.resource_quotas_json),
  manifest: parseJsonObject(row.manifest_json),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const normalizeCodeReviewRunRecord = (row: Record<string, unknown>): CodeReviewRunRecord => ({
  reviewId: String(row.review_id),
  projectId: String(row.project_id),
  prId: String(row.pr_id),
  title: String(row.title),
  status:
    row.status === 'clarification-needed'
      ? 'clarification-needed'
      : row.status === 'completed'
        ? 'completed'
        : row.status === 'failed'
          ? 'failed'
          : 'pending',
  summary: String(row.summary),
  backend: typeof row.backend === 'string' ? row.backend : undefined,
  reviewAgent: typeof row.review_agent === 'string' ? row.review_agent : undefined,
  repoRoot: typeof row.repo_root === 'string' ? row.repo_root : undefined,
  baseRef: typeof row.base_ref === 'string' ? row.base_ref : undefined,
  headRef: typeof row.head_ref === 'string' ? row.head_ref : undefined,
  findings: (() => {
    try {
      const parsed = JSON.parse(String(row.findings_json ?? '[]')) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is Record<string, unknown> => entry != null && typeof entry === 'object' && !Array.isArray(entry))
        : [];
    } catch {
      return [];
    }
  })(),
  findingsMarkdown: String(row.findings_markdown ?? ''),
  consensusId: typeof row.consensus_id === 'string' ? row.consensus_id : undefined,
  auditHash: typeof row.audit_hash === 'string' ? row.audit_hash : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const normalizeSkillEvolutionProposalRecord = (row: Record<string, unknown>): SkillEvolutionProposalRecord => ({
  proposalId: String(row.proposal_id),
  projectId: typeof row.project_id === 'string' ? row.project_id : undefined,
  proposalType: row.proposal_type === 'update-skill' ? 'update-skill' : 'new-skill',
  targetSkill: typeof row.target_skill === 'string' ? row.target_skill : undefined,
  title: String(row.title),
  description: String(row.description),
  rationale: String(row.rationale),
  proposedBy: String(row.proposed_by),
  status:
    row.status === 'pending-human-approval'
      ? 'pending-human-approval'
      : row.status === 'approved'
        ? 'approved'
        : row.status === 'rejected'
          ? 'rejected'
          : 'pending-consensus',
  manifest: parseJsonObject(row.manifest_json),
  stubFiles: (() => {
    const parsed = parseJsonObject(row.stub_files_json);
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  })(),
  consensusId: typeof row.consensus_id === 'string' ? row.consensus_id : undefined,
  auditHash: typeof row.audit_hash === 'string' ? row.audit_hash : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const normalizeRegisteredModelRecord = (row: Record<string, unknown>): RegisteredModelRecord => ({
  nodeId: String(row.node_id),
  modelId: String(row.model_id),
  displayName: String(row.display_name),
  backend:
    row.backend === 'apple-intelligence'
      ? 'apple-intelligence'
      : row.backend === 'mlx'
        ? 'mlx'
        : 'local-llama',
  path: typeof row.path === 'string' ? row.path : undefined,
  quantization: typeof row.quantization === 'string' ? row.quantization : undefined,
  contextLength: typeof row.context_length === 'number' ? row.context_length : undefined,
  sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : undefined,
  toolUse: Number(row.tool_use ?? 0) === 1,
  reasoningDepth:
    row.reasoning_depth === 'low'
      ? 'low'
      : row.reasoning_depth === 'high'
        ? 'high'
        : 'medium',
  speedTier:
    row.speed_tier === 'fast'
      ? 'fast'
      : row.speed_tier === 'heavy'
        ? 'heavy'
        : 'balanced',
  enabled: Number(row.enabled ?? 0) === 1,
  tags: parseJsonArray(row.tags_json),
  metadata: parseJsonObject(row.metadata_json),
  source:
    row.source === 'bootstrap-inventory'
      ? 'bootstrap-inventory'
      : row.source === 'federation-sync'
        ? 'federation-sync'
        : row.source === 'manual'
          ? 'manual'
          : row.source === 'huggingface-discovery'
            ? 'huggingface-discovery'
            : row.source === 'local-ai-zone-discovery'
              ? 'local-ai-zone-discovery'
              : row.source === 'downloaded'
                ? 'downloaded'
                : 'local-scan',
  lastSeenAt: String(row.last_seen_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const normalizeModelDiscoverySettingsRecord = (row: Record<string, unknown>): ModelDiscoverySettingsRecord => ({
  scopeKey: String(row.scope_key),
  projectId: typeof row.project_id === 'string' ? row.project_id : undefined,
  settings: parseJsonObject(row.settings_json),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
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

export const upsertRegisteredSkill = (input: UpsertRegisteredSkillInput, dbPath?: string): RegisteredSkillRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const record = {
      name: input.name,
      version: input.version,
      description: input.description,
      hash: computeRegistryHash(input.manifest),
      status: input.status ?? 'active',
      projectScoped: input.projectScoped ? 1 : 0,
      capabilitiesJson: JSON.stringify(input.capabilities ?? []),
      requiredBackendsJson: JSON.stringify(input.requiredBackends ?? []),
      droidspeakVerbsJson: JSON.stringify(input.droidspeakVerbs ?? []),
      manifestJson: JSON.stringify(input.manifest),
      createdAt: now,
      updatedAt: now,
    };
    database.prepare(`
      INSERT INTO skill_registry (
        name, version, description, hash, status, project_scoped, capabilities_json, required_backends_json,
        droidspeak_verbs_json, manifest_json, created_at, updated_at
      ) VALUES (
        @name, @version, @description, @hash, @status, @projectScoped, @capabilitiesJson, @requiredBackendsJson,
        @droidspeakVerbsJson, @manifestJson, @createdAt, @updatedAt
      )
      ON CONFLICT(name) DO UPDATE SET
        version = excluded.version,
        description = excluded.description,
        hash = excluded.hash,
        status = excluded.status,
        project_scoped = excluded.project_scoped,
        capabilities_json = excluded.capabilities_json,
        required_backends_json = excluded.required_backends_json,
        droidspeak_verbs_json = excluded.droidspeak_verbs_json,
        manifest_json = excluded.manifest_json,
        updated_at = excluded.updated_at
    `).run(record);
    const row = database.prepare(`SELECT * FROM skill_registry WHERE name = ? LIMIT 1`).get(input.name) as Record<string, unknown>;
    return normalizeSkillRecord(row);
  } finally {
    database.close();
  }
};

export const listRegisteredSkills = (dbPath?: string): RegisteredSkillRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    return (database.prepare(`
      SELECT *
      FROM skill_registry
      ORDER BY updated_at DESC, name ASC
    `).all() as Record<string, unknown>[])
      .map(normalizeSkillRecord);
  } finally {
    database.close();
  }
};

export const getRegisteredSkill = (name: string, dbPath?: string): RegisteredSkillRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`SELECT * FROM skill_registry WHERE name = ? LIMIT 1`).get(name) as Record<string, unknown> | undefined;
    return row ? normalizeSkillRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const updateRegisteredSkillStatus = (
  name: string,
  status: RegisteredSkillRecord['status'],
  dbPath?: string,
): RegisteredSkillRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const updatedAt = new Date().toISOString();
    database.prepare(`
      UPDATE skill_registry
      SET status = ?, updated_at = ?
      WHERE name = ?
    `).run(status, updatedAt, name);
    const row = database.prepare(`SELECT * FROM skill_registry WHERE name = ? LIMIT 1`).get(name) as Record<string, unknown> | undefined;
    return row ? normalizeSkillRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const upsertRegisteredAgent = (input: UpsertRegisteredAgentInput, dbPath?: string): RegisteredAgentRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const record = {
      name: input.name,
      version: input.version,
      description: input.description,
      hash: computeRegistryHash(input.manifest),
      status: input.status ?? 'active',
      projectScoped: input.projectScoped ? 1 : 0,
      skillsJson: JSON.stringify(input.skills),
      priority: input.priority ?? 'medium',
      preferredBackend: input.preferredBackend ?? null,
      modelTier: input.modelTier ?? null,
      governanceParticipation: input.governanceParticipation ?? 'participant',
      consensusRolesJson: JSON.stringify(input.consensusRoles ?? []),
      resourceQuotasJson: JSON.stringify(input.resourceQuotas ?? {}),
      manifestJson: JSON.stringify(input.manifest),
      createdAt: now,
      updatedAt: now,
    };
    database.prepare(`
      INSERT INTO agent_registry (
        name, version, description, hash, status, project_scoped, skills_json, priority, preferred_backend,
        model_tier, governance_participation, consensus_roles_json, resource_quotas_json, manifest_json, created_at, updated_at
      ) VALUES (
        @name, @version, @description, @hash, @status, @projectScoped, @skillsJson, @priority, @preferredBackend,
        @modelTier, @governanceParticipation, @consensusRolesJson, @resourceQuotasJson, @manifestJson, @createdAt, @updatedAt
      )
      ON CONFLICT(name) DO UPDATE SET
        version = excluded.version,
        description = excluded.description,
        hash = excluded.hash,
        status = excluded.status,
        project_scoped = excluded.project_scoped,
        skills_json = excluded.skills_json,
        priority = excluded.priority,
        preferred_backend = excluded.preferred_backend,
        model_tier = excluded.model_tier,
        governance_participation = excluded.governance_participation,
        consensus_roles_json = excluded.consensus_roles_json,
        resource_quotas_json = excluded.resource_quotas_json,
        manifest_json = excluded.manifest_json,
        updated_at = excluded.updated_at
    `).run(record);
    const row = database.prepare(`SELECT * FROM agent_registry WHERE name = ? LIMIT 1`).get(input.name) as Record<string, unknown>;
    return normalizeAgentRecord(row);
  } finally {
    database.close();
  }
};

export const listRegisteredAgents = (dbPath?: string): RegisteredAgentRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    return (database.prepare(`
      SELECT *
      FROM agent_registry
      ORDER BY updated_at DESC, name ASC
    `).all() as Record<string, unknown>[])
      .map(normalizeAgentRecord);
  } finally {
    database.close();
  }
};

export const getRegisteredAgent = (name: string, dbPath?: string): RegisteredAgentRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`SELECT * FROM agent_registry WHERE name = ? LIMIT 1`).get(name) as Record<string, unknown> | undefined;
    return row ? normalizeAgentRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const updateRegisteredAgentStatus = (
  name: string,
  status: RegisteredAgentRecord['status'],
  dbPath?: string,
): RegisteredAgentRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const updatedAt = new Date().toISOString();
    database.prepare(`
      UPDATE agent_registry
      SET status = ?, updated_at = ?
      WHERE name = ?
    `).run(status, updatedAt, name);
    const row = database.prepare(`SELECT * FROM agent_registry WHERE name = ? LIMIT 1`).get(name) as Record<string, unknown> | undefined;
    return row ? normalizeAgentRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const listRegisteredAgentsByConsensusRole = (role: string, dbPath?: string): RegisteredAgentRecord[] =>
  listRegisteredAgents(dbPath).filter((entry) => entry.consensusRoles.includes(role));

export const upsertRegisteredModel = (input: UpsertRegisteredModelInput, dbPath?: string): RegisteredModelRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const record = {
      nodeId: input.nodeId,
      modelId: input.modelId,
      displayName: input.displayName,
      backend: input.backend,
      path: input.path ?? null,
      quantization: input.quantization ?? null,
      contextLength: input.contextLength ?? null,
      sizeBytes: input.sizeBytes ?? null,
      toolUse: input.toolUse === true ? 1 : 0,
      reasoningDepth: input.reasoningDepth ?? 'medium',
      speedTier: input.speedTier ?? 'balanced',
      enabled: input.enabled === false ? 0 : 1,
      tagsJson: JSON.stringify(input.tags ?? []),
      metadataJson: JSON.stringify(input.metadata ?? {}),
      source: input.source ?? 'local-scan',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    database.prepare(`
      INSERT INTO models (
        node_id, model_id, display_name, backend, path, quantization, context_length, size_bytes, tool_use,
        reasoning_depth, speed_tier, enabled, tags_json, metadata_json, source, last_seen_at, created_at, updated_at
      ) VALUES (
        @nodeId, @modelId, @displayName, @backend, @path, @quantization, @contextLength, @sizeBytes, @toolUse,
        @reasoningDepth, @speedTier, @enabled, @tagsJson, @metadataJson, @source, @lastSeenAt, @createdAt, @updatedAt
      )
      ON CONFLICT(node_id, model_id) DO UPDATE SET
        display_name = excluded.display_name,
        backend = excluded.backend,
        path = excluded.path,
        quantization = excluded.quantization,
        context_length = excluded.context_length,
        size_bytes = excluded.size_bytes,
        tool_use = excluded.tool_use,
        reasoning_depth = excluded.reasoning_depth,
        speed_tier = excluded.speed_tier,
        enabled = excluded.enabled,
        tags_json = excluded.tags_json,
        metadata_json = excluded.metadata_json,
        source = excluded.source,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `).run(record);
    const row = database.prepare(`
      SELECT *
      FROM models
      WHERE node_id = ? AND model_id = ?
      LIMIT 1
    `).get(input.nodeId, input.modelId) as Record<string, unknown>;
    return normalizeRegisteredModelRecord(row);
  } finally {
    database.close();
  }
};

export const listRegisteredModels = (
  input?: {
    nodeId?: string;
    backend?: RegisteredModelRecord['backend'];
    enabledOnly?: boolean;
  },
  dbPath?: string,
): RegisteredModelRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input?.nodeId) {
      clauses.push('node_id = ?');
      values.push(input.nodeId);
    }
    if (input?.backend) {
      clauses.push('backend = ?');
      values.push(input.backend);
    }
    if (input?.enabledOnly) {
      clauses.push('enabled = 1');
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return (database.prepare(`
      SELECT *
      FROM models
      ${whereClause}
      ORDER BY updated_at DESC, display_name ASC
    `).all(...values) as Record<string, unknown>[])
      .map(normalizeRegisteredModelRecord);
  } finally {
    database.close();
  }
};

export const getRegisteredModel = (
  nodeId: string,
  modelId: string,
  dbPath?: string,
): RegisteredModelRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`
      SELECT *
      FROM models
      WHERE node_id = ? AND model_id = ?
      LIMIT 1
    `).get(nodeId, modelId) as Record<string, unknown> | undefined;
    return row ? normalizeRegisteredModelRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const upsertModelDiscoverySettings = (
  scopeKey: string,
  settings: Record<string, unknown>,
  input?: { projectId?: string },
  dbPath?: string,
): ModelDiscoverySettingsRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO model_discovery_settings (
        scope_key, project_id, settings_json, created_at, updated_at
      ) VALUES (
        @scopeKey, @projectId, @settingsJson, @createdAt, @updatedAt
      )
      ON CONFLICT(scope_key) DO UPDATE SET
        project_id = excluded.project_id,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `).run({
      scopeKey,
      projectId: input?.projectId ?? null,
      settingsJson: JSON.stringify(settings),
      createdAt: now,
      updatedAt: now,
    });
    const row = database.prepare(`
      SELECT *
      FROM model_discovery_settings
      WHERE scope_key = ?
      LIMIT 1
    `).get(scopeKey) as Record<string, unknown>;
    return normalizeModelDiscoverySettingsRecord(row);
  } finally {
    database.close();
  }
};

export const getModelDiscoverySettings = (
  scopeKey: string,
  dbPath?: string,
): ModelDiscoverySettingsRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`
      SELECT *
      FROM model_discovery_settings
      WHERE scope_key = ?
      LIMIT 1
    `).get(scopeKey) as Record<string, unknown> | undefined;
    return row ? normalizeModelDiscoverySettingsRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const upsertSkillEvolutionProposal = (
  input: UpsertSkillEvolutionProposalInput,
  dbPath?: string,
): SkillEvolutionProposalRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO skill_evolution_proposals (
        proposal_id, project_id, proposal_type, target_skill, title, description, rationale, proposed_by,
        status, manifest_json, stub_files_json, consensus_id, audit_hash, created_at, updated_at
      ) VALUES (
        @proposalId, @projectId, @proposalType, @targetSkill, @title, @description, @rationale, @proposedBy,
        @status, @manifestJson, @stubFilesJson, @consensusId, @auditHash, @createdAt, @updatedAt
      )
      ON CONFLICT(proposal_id) DO UPDATE SET
        project_id = excluded.project_id,
        proposal_type = excluded.proposal_type,
        target_skill = excluded.target_skill,
        title = excluded.title,
        description = excluded.description,
        rationale = excluded.rationale,
        proposed_by = excluded.proposed_by,
        status = excluded.status,
        manifest_json = excluded.manifest_json,
        stub_files_json = excluded.stub_files_json,
        consensus_id = excluded.consensus_id,
        audit_hash = excluded.audit_hash,
        updated_at = excluded.updated_at
    `).run({
      proposalId: input.proposalId,
      projectId: input.projectId ?? null,
      proposalType: input.proposalType,
      targetSkill: input.targetSkill ?? null,
      title: input.title,
      description: input.description,
      rationale: input.rationale,
      proposedBy: input.proposedBy,
      status: input.status,
      manifestJson: JSON.stringify(input.manifest),
      stubFilesJson: JSON.stringify(input.stubFiles),
      consensusId: input.consensusId ?? null,
      auditHash: input.auditHash ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const row = database.prepare(`
      SELECT *
      FROM skill_evolution_proposals
      WHERE proposal_id = ?
      LIMIT 1
    `).get(input.proposalId) as Record<string, unknown>;
    return normalizeSkillEvolutionProposalRecord(row);
  } finally {
    database.close();
  }
};

export const listSkillEvolutionProposals = (input?: {
  projectId?: string;
  status?: SkillEvolutionProposalRecord['status'];
}, dbPath?: string): SkillEvolutionProposalRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input?.projectId) {
      clauses.push('project_id = ?');
      values.push(input.projectId);
    }
    if (input?.status) {
      clauses.push('status = ?');
      values.push(input.status);
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return (database.prepare(`
      SELECT *
      FROM skill_evolution_proposals
      ${whereClause}
      ORDER BY updated_at DESC, title ASC
    `).all(...values) as Record<string, unknown>[])
      .map(normalizeSkillEvolutionProposalRecord);
  } finally {
    database.close();
  }
};

export const getSkillEvolutionProposal = (
  proposalId: string,
  dbPath?: string,
): SkillEvolutionProposalRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`
      SELECT *
      FROM skill_evolution_proposals
      WHERE proposal_id = ?
      LIMIT 1
    `).get(proposalId) as Record<string, unknown> | undefined;
    return row ? normalizeSkillEvolutionProposalRecord(row) : undefined;
  } finally {
    database.close();
  }
};

export const upsertCodeReviewRun = (input: UpsertCodeReviewRunInput, dbPath?: string): CodeReviewRunRecord => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const record = {
      reviewId: input.reviewId,
      projectId: input.projectId,
      prId: input.prId,
      title: input.title,
      status: input.status,
      summary: input.summary,
      backend: input.backend ?? null,
      reviewAgent: input.reviewAgent ?? null,
      repoRoot: input.repoRoot ?? null,
      baseRef: input.baseRef ?? null,
      headRef: input.headRef ?? null,
      findingsJson: JSON.stringify(input.findings ?? []),
      findingsMarkdown: input.findingsMarkdown ?? '',
      consensusId: input.consensusId ?? null,
      auditHash: input.auditHash ?? null,
      createdAt: now,
      updatedAt: now,
    };
    database.prepare(`
      INSERT INTO code_review_runs (
        review_id, project_id, pr_id, title, status, summary, backend, review_agent, repo_root,
        base_ref, head_ref, findings_json, findings_markdown, consensus_id, audit_hash, created_at, updated_at
      ) VALUES (
        @reviewId, @projectId, @prId, @title, @status, @summary, @backend, @reviewAgent, @repoRoot,
        @baseRef, @headRef, @findingsJson, @findingsMarkdown, @consensusId, @auditHash, @createdAt, @updatedAt
      )
      ON CONFLICT(review_id) DO UPDATE SET
        project_id = excluded.project_id,
        pr_id = excluded.pr_id,
        title = excluded.title,
        status = excluded.status,
        summary = excluded.summary,
        backend = excluded.backend,
        review_agent = excluded.review_agent,
        repo_root = excluded.repo_root,
        base_ref = excluded.base_ref,
        head_ref = excluded.head_ref,
        findings_json = excluded.findings_json,
        findings_markdown = excluded.findings_markdown,
        consensus_id = excluded.consensus_id,
        audit_hash = excluded.audit_hash,
        updated_at = excluded.updated_at
    `).run(record);
    const row = database.prepare(`SELECT * FROM code_review_runs WHERE review_id = ? LIMIT 1`).get(input.reviewId) as Record<string, unknown>;
    return normalizeCodeReviewRunRecord(row);
  } finally {
    database.close();
  }
};

export const listCodeReviewRuns = (input?: { projectId?: string; prId?: string }, dbPath?: string): CodeReviewRunRecord[] => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input?.projectId) {
      clauses.push(`project_id = ?`);
      values.push(input.projectId);
    }
    if (input?.prId) {
      clauses.push(`pr_id = ?`);
      values.push(input.prId);
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return (database.prepare(`
      SELECT *
      FROM code_review_runs
      ${whereClause}
      ORDER BY updated_at DESC, review_id DESC
    `).all(...values) as Record<string, unknown>[])
      .map(normalizeCodeReviewRunRecord);
  } finally {
    database.close();
  }
};

export const getCodeReviewRun = (reviewId: string, dbPath?: string): CodeReviewRunRecord | undefined => {
  const database = openProjectRegistryDatabase(dbPath);
  try {
    const row = database.prepare(`SELECT * FROM code_review_runs WHERE review_id = ? LIMIT 1`).get(reviewId) as Record<string, unknown> | undefined;
    return row ? normalizeCodeReviewRunRecord(row) : undefined;
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
