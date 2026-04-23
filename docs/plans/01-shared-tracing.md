Shared-Tracing Tamper-Evident Audit Logging Upgrade Plan
For Codex Agent Execution
Objective
Extend the existing packages/shared-tracing (currently a minimal Pino/console-based tracer per repo README) into a tamper-evident, immutable audit system. Every critical event (task handoff, agent decision, federation message, code execution, state change) will be written to an append-only SQLite table with hash-chaining + Merkle tree + Ed25519 signing. This provides cryptographic proof of integrity, supports future federation drift detection, and satisfies the security hardening step.
Principles

Backward-compatible: Keep existing trace(), logEvent(), etc. APIs unchanged.
Zero extra deps: Reuse better-sqlite3 from shared-persistence and Node’s built-in crypto (Ed25519).
Append-only + immutable: No UPDATE/DELETE ever allowed.
Performance: WAL mode + batch inserts; Merkle tree rebuilt only on demand or every N events.
Federation-ready: Logs will be verifiable across peers once BEHCS bus is added.

Phase 1: Extend Database Schema
In packages/shared-persistence (or new shared-tracing/schema.ts):

Add new table audit_log (if not exists):SQLCREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                    -- ISO timestamp
  swarm_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  event_type TEXT NOT NULL,            -- e.g. "TASK_HANDOFF", "CODE_EXEC", "FEDERATION_MSG"
  payload BLOB NOT NULL,               -- JSON stringified + compressed
  prev_hash TEXT NOT NULL,             -- SHA-256 of previous row
  merkle_leaf TEXT NOT NULL,           -- Hash of this row
  signature TEXT,                      -- Ed25519 signature (optional at first)
  height INTEGER NOT NULL              -- Sequence number for Merkle tree
) STRICT;
Create index: CREATE INDEX IF NOT EXISTS idx_audit_swarm_ts ON audit_log(swarm_id, ts);
Add migration hook in shared-persistence init (run once on startup).

Phase 2: Core Tamper-Evident Logger (1 hour)
Create/update packages/shared-tracing/src/audit-logger.ts:
TypeScriptimport { db } from 'shared-persistence';
import crypto from 'node:crypto';
import { KeyPair } from 'shared-config'; // reuse or generate once per swarm

let lastHash = 'genesis-hash-0000...'; // loaded from DB on start
let merkleTree: string[] = []; // in-memory leaves, rebuilt on query if needed

export async function appendAuditEvent(eventType: string, payload: any, nodeId: string) {
  const ts = new Date().toISOString();
  const payloadStr = JSON.stringify(payload);
  const rowHash = crypto.createHash('sha256')
    .update(`${ts}|${eventType}|${payloadStr}|${lastHash}`)
    .digest('hex');

  // Ed25519 signature (using swarm keypair)
  const signature = KeyPair.sign(rowHash); // pseudo-code; use node:crypto.subtle or ed25519 lib if added

  const stmt = db.prepare(`
    INSERT INTO audit_log 
    (ts, swarm_id, node_id, event_type, payload, prev_hash, merkle_leaf, signature, height)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(ts, process.env.SWARM_ID, nodeId, eventType, payloadStr, lastHash, rowHash, signature, merkleTree.length);
  
  lastHash = rowHash;
  merkleTree.push(rowHash);

  return { id: result.lastInsertRowid, hash: rowHash };
}
Phase 3: Merkle Tree & Verification Helpers (45 min)
Add to same file:
TypeScriptexport function getMerkleRoot(): string {
  // Simple binary Merkle tree reduction (reuse or implement lightweight)
  let tree = [...merkleTree];
  while (tree.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < tree.length; i += 2) {
      const left = tree[i];
      const right = tree[i + 1] || left;
      next.push(crypto.createHash('sha256').update(left + right).digest('hex'));
    }
    tree = next;
  }
  return tree[0] || 'empty';
}

export function verifyChain(startId: number, endId: number): boolean {
  // Replay hashes from DB and check continuity + signatures
  // Return true only if every prev_hash matches and signatures validate
}
Phase 4: Public API & Integration (45 min)
Update packages/shared-tracing/src/index.ts:
TypeScriptexport const tracer = {
  // Existing Pino/console methods remain unchanged
  info: (msg: string, meta?: any) => { /* ... */ },
  
  // New tamper-evident methods
  audit: async (eventType: string, payload: any) => {
    const nodeId = process.env.NODE_ID || 'local';
    return appendAuditEvent(eventType, payload, nodeId);
  },
  
  getAuditRoot: getMerkleRoot,
  verifyAuditChain: verifyChain,
  exportProof: (eventId: number) => { /* return row + merkle proof */ }
};

// Auto-hook into existing orchestrator events (task start/end, handoff, code exec)
export function instrumentOrchestrator(orchestrator: any) {
  // Wrap critical methods with tracer.audit(...)
}
Hook the new tracer in:

apps/orchestrator startup
apps/worker-host (before/after any code execution)
shared-routing and future federation bus
All handoff packets (add auditHash field to EnvelopeV2)

Phase 5: Testing & Polish

Unit tests: append 100 events → verify chain integrity + Merkle root consistency.
Tamper test: Manually edit DB row → verifyChain must return false.
Performance: Ensure < 2 ms per audit write (WAL + prepared statements).
Dashboard addition: New “Audit Trail” tab showing Merkle root and latest events.

Codex Agent Instructions

Implement exactly in this order (Phase 1 → 5).
Commit after each phase with clear message “shared-tracing: tamper-evident audit [phase]”.
Update shared-persistence init to run the audit_log migration.
Add SWARM_ID and node keypair generation to shared-config bootstrap if missing.
Do not add any new npm dependencies.

This upgrade turns shared-tracing into the cryptographic backbone for the entire system—essential before federation and for the security hardening step. Once complete, every agent action becomes provably immutable and verifiable across devices.