import { createHash, createPrivateKey, createPublicKey, sign as signPayload, verify as verifySignature } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import { loadOrCreateAuditSigningKeyPair, loadSharedConfig } from '@shared-config';
import { openPersistenceDatabase } from '@shared-persistence';

export interface AuditAppendResult {
  id: number;
  hash: string;
  height: number;
  signature?: string;
}

export interface AuditLogEvent {
  id: number;
  ts: string;
  swarmId: string;
  nodeId: string;
  eventType: string;
  payload: Record<string, unknown>;
  prevHash: string;
  merkleLeaf: string;
  signature?: string;
  height: number;
}

export interface AuditProofStep {
  side: 'left' | 'right';
  hash: string;
}

export interface AuditProof {
  event: AuditLogEvent;
  merkleRoot: string;
  proof: AuditProofStep[];
}

type AuditLogRow = {
  id: number;
  ts: string;
  swarm_id: string;
  node_id: string;
  event_type: string;
  payload: Buffer;
  prev_hash: string;
  merkle_leaf: string;
  signature?: string | null;
  height: number;
};

type AuditLoggerState = {
  dbPath: string;
  lastLeaf?: string;
  lastHeight: number;
};

const GENESIS_HASH = 'genesis-hash-00000000000000000000000000000000';
const stateByDbPath = new Map<string, AuditLoggerState>();

const resolveDbPath = (dbPath?: string): string => dbPath ?? process.env.DROIDSWARM_DB_PATH ?? loadSharedConfig().dbPath;

const getState = (dbPath: string): AuditLoggerState => {
  const existing = stateByDbPath.get(dbPath);
  if (existing) {
    return existing;
  }
  const created: AuditLoggerState = { dbPath, lastHeight: -1 };
  stateByDbPath.set(dbPath, created);
  return created;
};

const openAuditDatabase = (dbPath?: string) => openPersistenceDatabase(resolveDbPath(dbPath));

const stableSerialize = (input: unknown): string => {
  if (input == null || typeof input !== 'object') {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};

const inflatePayload = (payload: Buffer): Record<string, unknown> => {
  const inflated = gunzipSync(payload).toString('utf8');
  return JSON.parse(inflated) as Record<string, unknown>;
};

const deflatePayload = (payload: Record<string, unknown>): Buffer =>
  gzipSync(Buffer.from(stableSerialize(payload), 'utf8'));

const computeLeafHash = (input: {
  ts: string;
  swarmId: string;
  nodeId: string;
  eventType: string;
  payload: Record<string, unknown>;
  prevHash: string;
  height: number;
}): string =>
  createHash('sha256')
    .update([
      input.ts,
      input.swarmId,
      input.nodeId,
      input.eventType,
      stableSerialize(input.payload),
      input.prevHash,
      String(input.height),
    ].join('|'))
    .digest('hex');

const loadLastRow = (dbPath?: string): Pick<AuditLogRow, 'merkle_leaf' | 'height'> | undefined => {
  const database = openAuditDatabase(dbPath);
  try {
    return database.prepare(`
      SELECT merkle_leaf, height
      FROM audit_log
      ORDER BY id DESC
      LIMIT 1
    `).get() as Pick<AuditLogRow, 'merkle_leaf' | 'height'> | undefined;
  } finally {
    database.close();
  }
};

const signHash = (hash: string, dbPath?: string): string => {
  const pair = loadOrCreateAuditSigningKeyPair(resolveDbPath(dbPath));
  return signPayload(
    null,
    Buffer.from(hash, 'utf8'),
    createPrivateKey(pair.privateKeyPem),
  ).toString('base64');
};

const verifySignatureForHash = (hash: string, signature: string | undefined, dbPath?: string): boolean => {
  if (!signature) {
    return true;
  }

  const pair = loadOrCreateAuditSigningKeyPair(resolveDbPath(dbPath));
  return verifySignature(
    null,
    Buffer.from(hash, 'utf8'),
    createPublicKey(pair.publicKeyPem),
    Buffer.from(signature, 'base64'),
  );
};

export const appendAuditEvent = (
  eventType: string,
  payload: Record<string, unknown>,
  nodeId = process.env.DROIDSWARM_FEDERATION_NODE_ID ?? process.env.DROIDSWARM_SWARM_ID ?? 'local',
  options?: {
    dbPath?: string;
    swarmId?: string;
  },
): AuditAppendResult => {
  const dbPath = resolveDbPath(options?.dbPath);
  const state = getState(dbPath);
  if (state.lastHeight < 0) {
    const lastRow = loadLastRow(dbPath);
    state.lastLeaf = lastRow?.merkle_leaf;
    state.lastHeight = lastRow?.height ?? -1;
  }

  const database = openAuditDatabase(dbPath);
  try {
    const ts = new Date().toISOString();
    const swarmId = options?.swarmId ?? process.env.DROIDSWARM_SWARM_ID ?? loadSharedConfig().projectId;
    const prevHash = state.lastLeaf ?? GENESIS_HASH;
    const height = state.lastHeight + 1;
    const merkleLeaf = computeLeafHash({ ts, swarmId, nodeId, eventType, payload, prevHash, height });
    const signature = signHash(merkleLeaf, dbPath);
    const result = database.prepare(`
      INSERT INTO audit_log (
        ts, swarm_id, node_id, event_type, payload, prev_hash, merkle_leaf, signature, height
      ) VALUES (
        @ts, @swarmId, @nodeId, @eventType, @payload, @prevHash, @merkleLeaf, @signature, @height
      )
    `).run({
      ts,
      swarmId,
      nodeId,
      eventType,
      payload: deflatePayload(payload),
      prevHash,
      merkleLeaf,
      signature,
      height,
    });

    state.lastLeaf = merkleLeaf;
    state.lastHeight = height;
    return {
      id: Number(result.lastInsertRowid),
      hash: merkleLeaf,
      height,
      signature,
    };
  } finally {
    database.close();
  }
};

const loadRows = (dbPath?: string, startId?: number, endId?: number): AuditLogRow[] => {
  const database = openAuditDatabase(dbPath);
  try {
    if (startId != null && endId != null) {
      return database.prepare(`
        SELECT *
        FROM audit_log
        WHERE id BETWEEN ? AND ?
        ORDER BY id ASC
      `).all(startId, endId) as AuditLogRow[];
    }

    return database.prepare(`
      SELECT *
      FROM audit_log
      ORDER BY id ASC
    `).all() as AuditLogRow[];
  } finally {
    database.close();
  }
};

const toEvent = (row: AuditLogRow): AuditLogEvent => ({
  id: row.id,
  ts: row.ts,
  swarmId: row.swarm_id,
  nodeId: row.node_id,
  eventType: row.event_type,
  payload: inflatePayload(row.payload),
  prevHash: row.prev_hash,
  merkleLeaf: row.merkle_leaf,
  signature: row.signature ?? undefined,
  height: row.height,
});

const computeMerkleRootFromLeaves = (leaves: string[]): string => {
  if (leaves.length === 0) {
    return 'empty';
  }

  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(createHash('sha256').update(left + right).digest('hex'));
    }
    level = next;
  }
  return level[0];
};

export const getMerkleRoot = (dbPath?: string): string =>
  computeMerkleRootFromLeaves(loadRows(dbPath).map((row) => row.merkle_leaf));

export const listAuditEvents = (limit = 20, dbPath?: string): AuditLogEvent[] => {
  const database = openAuditDatabase(dbPath);
  try {
    const rows = database.prepare(`
      SELECT *
      FROM audit_log
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as AuditLogRow[];
    return rows.map(toEvent);
  } finally {
    database.close();
  }
};

export const verifyChain = (startId = 1, endId = Number.MAX_SAFE_INTEGER, dbPath?: string): boolean => {
  const rows = loadRows(dbPath, startId, endId);
  let previousHash = GENESIS_HASH;

  for (const row of rows) {
    let expectedLeaf: string;
    try {
      const payload = inflatePayload(row.payload);
      expectedLeaf = computeLeafHash({
        ts: row.ts,
        swarmId: row.swarm_id,
        nodeId: row.node_id,
        eventType: row.event_type,
        payload,
        prevHash: previousHash,
        height: row.height,
      });
    } catch {
      return false;
    }

    if (row.prev_hash !== previousHash) {
      return false;
    }

    if (row.merkle_leaf !== expectedLeaf) {
      return false;
    }

    if (!verifySignatureForHash(expectedLeaf, row.signature ?? undefined, dbPath)) {
      return false;
    }

    previousHash = row.merkle_leaf;
  }

  return true;
};

export const exportProof = (eventId: number, dbPath?: string): AuditProof | undefined => {
  const rows = loadRows(dbPath);
  const index = rows.findIndex((row) => row.id === eventId);
  if (index < 0) {
    return undefined;
  }

  let level = rows.map((row) => row.merkle_leaf);
  let cursor = index;
  const proof: AuditProofStep[] = [];

  while (level.length > 1) {
    const isRightNode = cursor % 2 === 1;
    const siblingIndex = isRightNode ? cursor - 1 : cursor + 1;
    const siblingHash = level[siblingIndex] ?? level[cursor];
    proof.push({
      side: isRightNode ? 'left' : 'right',
      hash: siblingHash,
    });

    const next: string[] = [];
    for (let position = 0; position < level.length; position += 2) {
      const left = level[position];
      const right = level[position + 1] ?? left;
      next.push(createHash('sha256').update(left + right).digest('hex'));
    }
    level = next;
    cursor = Math.floor(cursor / 2);
  }

  return {
    event: toEvent(rows[index]),
    merkleRoot: level[0] ?? 'empty',
    proof,
  };
};
