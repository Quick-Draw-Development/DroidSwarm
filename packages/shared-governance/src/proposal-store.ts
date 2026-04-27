import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { appendAuditEvent } from '@shared-tracing';

import type { LawDefinition, LawId } from './laws-manifest';
import type { ConsensusRoundState } from './consensus-state';

export interface DriftSnapshotRecord {
  nodeId: string;
  projectId: string;
  localHash: string;
  remoteHash?: string;
  matches: boolean;
  source?: string;
  auditHash?: string;
  createdAt: string;
}

export interface LawProposalRecord {
  proposalId: string;
  lawId: LawId;
  title: string;
  description: string;
  rationale: string;
  glyph: string;
  proposedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  debateId?: string;
  approvalComment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceStatus {
  lawHash: string;
  activeLawCount: number;
  pendingProposalCount: number;
  approvedProposalCount: number;
  latestDebateAt?: string;
}

type GovernanceStore = {
  proposals: LawProposalRecord[];
  approvedRuntimeLaws: Array<Pick<LawDefinition, 'id' | 'version' | 'title' | 'description' | 'glyph'>>;
  consensusRounds: ConsensusRoundState[];
  driftSnapshots: DriftSnapshotRecord[];
  latestDebateAt?: string;
};

const defaultStore = (): GovernanceStore => ({
  proposals: [],
  approvedRuntimeLaws: [],
  consensusRounds: [],
  driftSnapshots: [],
});

export const resolveGovernanceDir = (): string =>
  process.env.DROIDSWARM_GOVERNANCE_DIR
  ?? path.resolve(process.env.DROIDSWARM_HOME ?? path.resolve(process.env.HOME ?? process.cwd(), '.droidswarm'), 'governance');

const resolveStoreFile = (): string => path.resolve(resolveGovernanceDir(), 'store.json');

const ensureGovernanceDir = (): void => {
  fs.mkdirSync(resolveGovernanceDir(), { recursive: true });
};

const readStore = (): GovernanceStore => {
  ensureGovernanceDir();
  const file = resolveStoreFile();
  if (!fs.existsSync(file)) {
    return defaultStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<GovernanceStore>;
    return {
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals as LawProposalRecord[] : [],
      approvedRuntimeLaws: Array.isArray(parsed.approvedRuntimeLaws) ? parsed.approvedRuntimeLaws as LawDefinition[] : [],
      consensusRounds: Array.isArray(parsed.consensusRounds) ? parsed.consensusRounds as ConsensusRoundState[] : [],
      driftSnapshots: Array.isArray(parsed.driftSnapshots) ? parsed.driftSnapshots as DriftSnapshotRecord[] : [],
      latestDebateAt: typeof parsed.latestDebateAt === 'string' ? parsed.latestDebateAt : undefined,
    };
  } catch {
    return defaultStore();
  }
};

const writeStore = (store: GovernanceStore): void => {
  ensureGovernanceDir();
  fs.writeFileSync(resolveStoreFile(), JSON.stringify(store, null, 2));
};

export const listLawProposals = (): LawProposalRecord[] =>
  readStore().proposals.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

export const listApprovedRuntimeLaws = (): LawDefinition[] =>
  readStore().approvedRuntimeLaws.map((law) => ({
    ...law,
    enforcement: () => [],
  }));

export const createLawProposal = (input: {
  lawId: LawId;
  title: string;
  description: string;
  rationale: string;
  glyph: string;
  proposedBy: string;
  debateId?: string;
}): LawProposalRecord => {
  const store = readStore();
  const now = new Date().toISOString();
  const record: LawProposalRecord = {
    proposalId: randomUUID(),
    lawId: input.lawId,
    title: input.title,
    description: input.description,
    rationale: input.rationale,
    glyph: input.glyph,
    proposedBy: input.proposedBy,
    status: 'pending',
    debateId: input.debateId,
    createdAt: now,
    updatedAt: now,
  };
  store.proposals.unshift(record);
  writeStore(store);
  appendAuditEvent('GOVERNANCE_PROPOSAL_CREATED', {
    proposalId: record.proposalId,
    lawId: record.lawId,
    proposedBy: record.proposedBy,
  });
  return record;
};

const appendLawToSystemDocument = (
  law: Pick<LawDefinition, 'id' | 'description'>,
  rootDir: string,
): void => {
  const file = path.resolve(rootDir, 'SYSTEM_LAWS.md');
  if (!fs.existsSync(file)) {
    return;
  }
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.includes(`## ${law.id}`)) {
    return;
  }
  const addition = `\n\n## ${law.id}\n\n${law.description}\n`;
  fs.writeFileSync(file, `${raw.trimEnd()}${addition}`);
};

export const approveLawProposal = (proposalId: string, input: {
  approvedBy: string;
  comment?: string;
  rootDir?: string;
}): LawProposalRecord => {
  const store = readStore();
  const proposal = store.proposals.find((entry) => entry.proposalId === proposalId);
  if (!proposal) {
    throw new Error(`Unknown governance proposal: ${proposalId}`);
  }
  proposal.status = 'approved';
  proposal.approvalComment = input.comment;
  proposal.updatedAt = new Date().toISOString();
  const approvedLaw: Pick<LawDefinition, 'id' | 'version' | 'title' | 'description' | 'glyph'> = {
    id: proposal.lawId,
    version: proposal.updatedAt.slice(0, 10),
    title: proposal.title,
    description: proposal.description,
    glyph: proposal.glyph,
  };
  if (!store.approvedRuntimeLaws.some((entry) => entry.id === approvedLaw.id)) {
    store.approvedRuntimeLaws.push(approvedLaw);
  }
  writeStore(store);
  appendAuditEvent('GOVERNANCE_PROPOSAL_APPROVED', {
    proposalId,
    lawId: proposal.lawId,
    approvedBy: input.approvedBy,
    comment: input.comment,
  });
  appendLawToSystemDocument(approvedLaw, input.rootDir ?? process.cwd());
  return proposal;
};

export const overrideLawProposal = (proposalId: string, input: {
  overriddenBy: string;
  comment?: string;
  rootDir?: string;
}): LawProposalRecord =>
  approveLawProposal(proposalId, {
    approvedBy: input.overriddenBy,
    comment: input.comment ?? `Human override by ${input.overriddenBy}.`,
    rootDir: input.rootDir,
  });

export const rejectLawProposal = (proposalId: string, input: {
  rejectedBy: string;
  comment?: string;
}): LawProposalRecord => {
  const store = readStore();
  const proposal = store.proposals.find((entry) => entry.proposalId === proposalId);
  if (!proposal) {
    throw new Error(`Unknown governance proposal: ${proposalId}`);
  }
  proposal.status = 'rejected';
  proposal.approvalComment = input.comment;
  proposal.updatedAt = new Date().toISOString();
  writeStore(store);
  appendAuditEvent('GOVERNANCE_PROPOSAL_REJECTED', {
    proposalId,
    lawId: proposal.lawId,
    rejectedBy: input.rejectedBy,
    comment: input.comment,
  });
  return proposal;
};

export const recordGovernanceDebateTimestamp = (ts: string): void => {
  const store = readStore();
  store.latestDebateAt = ts;
  writeStore(store);
};

export const recordConsensusRound = (round: ConsensusRoundState): ConsensusRoundState => {
  const store = readStore();
  store.consensusRounds.unshift(round);
  store.consensusRounds = store.consensusRounds.slice(0, 200);
  writeStore(store);
  return round;
};

export const listConsensusRounds = (): ConsensusRoundState[] =>
  readStore().consensusRounds.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

export const recordDriftSnapshot = (input: Omit<DriftSnapshotRecord, 'createdAt'>): DriftSnapshotRecord => {
  const store = readStore();
  const record: DriftSnapshotRecord = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  store.driftSnapshots.unshift(record);
  store.driftSnapshots = store.driftSnapshots.slice(0, 200);
  writeStore(store);
  return record;
};

export const listDriftSnapshots = (): DriftSnapshotRecord[] =>
  readStore().driftSnapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
