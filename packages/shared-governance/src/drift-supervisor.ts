import { appendAuditEvent } from '@shared-tracing';

import { fetchBusEvents, postToBus } from '@federation-bus';
import { computeSystemStateHash } from './compliance';
import { recordDriftSnapshot, type DriftSnapshotRecord } from './proposal-store';

export const createDriftSnapshot = (input: {
  nodeId: string;
  projectId: string;
  remoteHash?: string;
  source?: string;
}): DriftSnapshotRecord => {
  const localHash = computeSystemStateHash();
  const matches = !input.remoteHash || input.remoteHash === localHash;
  const audit = appendAuditEvent(matches ? 'GOVERNANCE_DRIFT_CHECK' : 'GOVERNANCE_DRIFT_DETECTED', {
    nodeId: input.nodeId,
    projectId: input.projectId,
    localHash,
    remoteHash: input.remoteHash,
    source: input.source,
    matches,
  });
  return recordDriftSnapshot({
    nodeId: input.nodeId,
    projectId: input.projectId,
    localHash,
    remoteHash: input.remoteHash,
    matches,
    source: input.source,
    auditHash: audit.hash,
  });
};

export const broadcastSystemStateHash = async (input: {
  busUrl: string;
  sourceNodeId: string;
  projectId: string;
  signing?: { keyId: string; privateKeyPem: string };
}): Promise<DriftSnapshotRecord> => {
  const snapshot = createDriftSnapshot({
    nodeId: input.sourceNodeId,
    projectId: input.projectId,
    source: 'local-broadcast',
  });
  await postToBus(input.busUrl, {
    sourceNodeId: input.sourceNodeId,
    envelope: {
      id: `drift-${Date.now()}`,
      ts: new Date().toISOString(),
      project_id: input.projectId,
      swarm_id: input.sourceNodeId,
      room_id: 'operator',
      verb: 'drift.detected',
      audit_hash: snapshot.auditHash,
      body: {
        metadata: {
          systemStateHash: snapshot.localHash,
          matches: snapshot.matches,
          source: snapshot.source,
        },
      },
    },
  }, input.signing);
  return snapshot;
};

export const inspectRecentDriftFromBus = async (busUrl: string): Promise<DriftSnapshotRecord | undefined> => {
  const payload = await fetchBusEvents(busUrl, 0, 10);
  const event = [...payload.events].reverse().find((entry) => entry.envelope.verb === 'drift.detected');
  if (!event) {
    return undefined;
  }
  const metadata = (event.envelope.body.metadata ?? {}) as Record<string, unknown>;
  return createDriftSnapshot({
    nodeId: event.sourceNodeId,
    projectId: event.envelope.project_id,
    remoteHash: typeof metadata.systemStateHash === 'string' ? metadata.systemStateHash : undefined,
    source: 'federation-bus',
  });
};
