import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signPayload,
  verify as verifyPayload,
} from 'node:crypto';

import { envelopeV2Schema, type EnvelopeV2 } from '@shared-types';
import { z } from 'zod';

const heartbeatPayloadSchema = z.object({
  peerId: z.string().min(1),
  busUrl: z.string().url(),
  adminUrl: z.string().url(),
  capabilities: z.array(z.string()).default([]),
  projectIds: z.array(z.string()).optional(),
  role: z.enum(['master', 'slave']).optional(),
  ts: z.string().optional(),
});

const onboardPayloadSchema = heartbeatPayloadSchema.extend({
  projectId: z.string().optional(),
});

const kickPayloadSchema = z.object({
  peerId: z.string().min(1),
  reason: z.string().optional(),
});

const slaveRollCallPayloadSchema = z.object({
  nodeId: z.string().min(1),
  host: z.string().optional(),
  busUrl: z.string().url().optional(),
  adminUrl: z.string().url().optional(),
  version: z.string().optional(),
  projectId: z.string().optional(),
  hardwareFingerprintHash: z.string().optional(),
  publicKey: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  role: z.literal('slave').default('slave'),
  ts: z.string().optional(),
});

const signedRequestSchema = z.object({
  payload: z.unknown(),
  signedBy: z.string().optional(),
  nonce: z.string().optional(),
  signature: z.string().optional(),
});

export interface FederationSigningKey {
  keyId: string;
  privateKeyPem: string;
}

export interface FederationVerificationConfig {
  keyId: string;
  publicKeyPem: string;
  enforceVerification?: boolean;
}

export interface FederationPeerRecord {
  peerId: string;
  busUrl: string;
  adminUrl: string;
  capabilities: string[];
  projectIds: string[];
  role: 'master' | 'slave';
  status: 'active' | 'kicked';
  lastSeen: string;
  connected: boolean;
  kickedAt?: string;
}

export interface FederationProjectRecord {
  projectId: string;
  peers: string[];
}

export interface FederationDriftRecord {
  taskId: string;
  projectId: string;
  reportedDigestHash?: string;
  expectedDigestHash?: string;
  reportedHandoffHash?: string;
  expectedHandoffHash?: string;
  detectedAt: string;
}

export interface FederationBusEvent {
  sequence: number;
  receivedAt: string;
  sourceNodeId: string;
  envelope: EnvelopeV2;
}

export interface FederationBusStatus {
  nodeId: string;
  host: string;
  busPort: number;
  adminPort: number;
  latestSequence: number;
  peerCount: number;
  projectCount: number;
  recentEventCount: number;
  recentDriftCount: number;
  peers: FederationPeerRecord[];
  projects: FederationProjectRecord[];
  recentDrifts: FederationDriftRecord[];
  counters: {
    heartbeatsReceived: number;
    envelopesReceived: number;
    onboardingsReceived: number;
    kicksIssued: number;
    driftsDetected: number;
    slaveRollCallsReceived: number;
  };
}

export interface FederationBusConfig {
  nodeId: string;
  host: string;
  busPort: number;
  adminPort: number;
  projectIds?: string[];
  peerUrls?: string[];
  eventRetentionLimit?: number;
  debug?: boolean;
  swarmRole?: 'master' | 'slave';
  trustedPublicKeys?: Record<string, string>;
  enforceSignatures?: boolean;
  rulesHash?: string;
  droidspeakCatalog?: Record<string, unknown>;
  lawManifest?: Record<string, unknown>;
  onSlaveRollCall?: (payload: SlaveRollCallPayload) => Promise<SlaveWelcomeResponse | undefined> | SlaveWelcomeResponse | undefined;
}

export interface FederationBusService {
  close(): Promise<void>;
}

export interface PostToBusInput {
  sourceNodeId: string;
  envelope: EnvelopeV2;
}

export interface PostToBusResult {
  accepted: boolean;
  duplicate?: boolean;
  sequence?: number;
}

export interface FetchBusEventsResponse {
  latestSequence: number;
  events: FederationBusEvent[];
}

export interface SlaveRollCallPayload extends z.infer<typeof slaveRollCallPayloadSchema> {}

export interface SlaveWelcomeResponse {
  accepted: boolean;
  nodeId: string;
  swarmRole: 'master';
  rulesHash: string;
  droidspeakCatalog: Record<string, unknown>;
  lawManifest: Record<string, unknown>;
  projectId?: string;
  reason?: string;
}

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

const parseSignedPayload = async <T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<{
  payload: T;
  signedBy?: string;
  nonce?: string;
  signature?: string;
}> => {
  const raw = await readJson(req);
  const parsed = signedRequestSchema.parse(raw);
  return {
    payload: schema.parse(parsed.payload),
    signedBy: parsed.signedBy,
    nonce: parsed.nonce,
    signature: parsed.signature,
  };
};

const readJson = async (req: IncomingMessage): Promise<unknown> =>
  await new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body.length > 0 ? JSON.parse(body) as unknown : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const buildSignatureBase = (kind: string, payload: unknown, signedBy: string, nonce: string): Buffer =>
  Buffer.from(`${kind}|${signedBy}|${nonce}|${stableSerialize(payload)}`, 'utf8');

export const signFederationRequest = <T>(kind: string, payload: T, key: FederationSigningKey): {
  payload: T;
  signedBy: string;
  nonce: string;
  signature: string;
} => {
  const nonce = randomUUID();
  const signature = signPayload(
    null,
    buildSignatureBase(kind, payload, key.keyId, nonce),
    createPrivateKey(key.privateKeyPem),
  ).toString('base64');

  return {
    payload,
    signedBy: key.keyId,
    nonce,
    signature,
  };
};

export const verifyFederationRequest = (
  kind: string,
  payload: unknown,
  signedBy: string | undefined,
  nonce: string | undefined,
  signature: string | undefined,
  verification: FederationVerificationConfig,
): boolean => {
  if (!signedBy || !nonce || !signature) {
    return verification.enforceVerification !== true;
  }

  if (signedBy !== verification.keyId) {
    return false;
  }

  return verifyPayload(
    null,
    buildSignatureBase(kind, payload, signedBy, nonce),
    createPublicKey(verification.publicKeyPem),
    Buffer.from(signature, 'base64'),
  );
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Federation request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json() as T;
};

const makeSignedPayload = <T>(kind: string, payload: T, signing?: FederationSigningKey) =>
  signing ? signFederationRequest(kind, payload, signing) : { payload };

const normalizeBaseUrl = (value: string): string => value.endsWith('/') ? value.slice(0, -1) : value;

export const postToBus = async (
  busUrl: string,
  payload: PostToBusInput,
  signing?: FederationSigningKey,
): Promise<PostToBusResult> =>
  await requestJson<PostToBusResult>(`${normalizeBaseUrl(busUrl)}/events`, {
    method: 'POST',
    body: JSON.stringify(makeSignedPayload('events.post', payload, signing)),
  });

export const sendHeartbeat = async (
  busUrl: string,
  payload: z.infer<typeof heartbeatPayloadSchema>,
  signing?: FederationSigningKey,
): Promise<{ accepted: boolean }> =>
  await requestJson<{ accepted: boolean }>(`${normalizeBaseUrl(busUrl)}/heartbeat`, {
    method: 'POST',
    body: JSON.stringify(makeSignedPayload('heartbeat', payload, signing)),
  });

export const onboardPeer = async (
  adminUrl: string,
  payload: z.infer<typeof onboardPayloadSchema>,
  signing?: FederationSigningKey,
): Promise<{ accepted: boolean }> =>
  await requestJson<{ accepted: boolean }>(`${normalizeBaseUrl(adminUrl)}/onboard`, {
    method: 'POST',
    body: JSON.stringify(makeSignedPayload('onboard', payload, signing)),
  });

export const kickPeer = async (
  adminUrl: string,
  payload: z.infer<typeof kickPayloadSchema>,
  signing?: FederationSigningKey,
): Promise<{ accepted: boolean }> =>
  await requestJson<{ accepted: boolean }>(`${normalizeBaseUrl(adminUrl)}/kick`, {
    method: 'POST',
    body: JSON.stringify(makeSignedPayload('kick', payload, signing)),
  });

export const rollCallSlave = async (
  adminUrl: string,
  payload: SlaveRollCallPayload,
  signing?: FederationSigningKey,
): Promise<SlaveWelcomeResponse> =>
  await requestJson<SlaveWelcomeResponse>(`${normalizeBaseUrl(adminUrl)}/slave-roll-call`, {
    method: 'POST',
    body: JSON.stringify(makeSignedPayload('slave-roll-call', payload, signing)),
  });

export const fetchBusStatus = async (adminUrl: string): Promise<FederationBusStatus> =>
  await requestJson<FederationBusStatus>(`${normalizeBaseUrl(adminUrl)}/status`);

export const fetchBusEvents = async (
  busUrl: string,
  since = 0,
  limit = 25,
): Promise<FetchBusEventsResponse> =>
  await requestJson<FetchBusEventsResponse>(`${normalizeBaseUrl(busUrl)}/events?since=${since}&limit=${limit}`);

const findVerificationKey = (
  signedBy: string | undefined,
  trustedPublicKeys: Record<string, string>,
): FederationVerificationConfig | undefined => {
  if (!signedBy) {
    return undefined;
  }
  const publicKeyPem = trustedPublicKeys[signedBy];
  if (!publicKeyPem) {
    return undefined;
  }
  return {
    keyId: signedBy,
    publicKeyPem,
    enforceVerification: true,
  };
};

const validateSignedRequest = (input: {
  kind: string;
  signedBy?: string;
  nonce?: string;
  signature?: string;
  payload: unknown;
  trustedPublicKeys: Record<string, string>;
  enforceSignatures: boolean;
  seenNonces: Set<string>;
}): void => {
  if (!input.signedBy || !input.nonce || !input.signature) {
    if (input.enforceSignatures) {
      throw new Error(`Missing federation signature for ${input.kind}`);
    }
    return;
  }

  if (input.seenNonces.has(input.nonce)) {
    throw new Error(`Replay detected for ${input.kind}`);
  }

  const verification = findVerificationKey(input.signedBy, input.trustedPublicKeys);
  if (!verification) {
    if (input.enforceSignatures) {
      throw new Error(`Unknown federation signer: ${input.signedBy}`);
    }
    return;
  }

  if (!verifyFederationRequest(
    input.kind,
    input.payload,
    input.signedBy,
    input.nonce,
    input.signature,
    verification,
  )) {
    throw new Error(`Invalid federation signature for ${input.kind}`);
  }

  input.seenNonces.add(input.nonce);
};

const nowIso = (): string => new Date().toISOString();

const removeOldestNonce = (seenNonces: Set<string>): void => {
  const first = seenNonces.values().next().value as string | undefined;
  if (first) {
    seenNonces.delete(first);
  }
};

export const startFederationBus = (config: FederationBusConfig): FederationBusService => {
  const peerMap = new Map<string, FederationPeerRecord>();
  const projectMap = new Map<string, Set<string>>();
  const taskContinuity = new Map<string, { projectId: string; digestHash?: string; handoffHash?: string }>();
  const recentDrifts: FederationDriftRecord[] = [];
  const events: FederationBusEvent[] = [];
  const seenEnvelopeIds = new Set<string>();
  const seenNonces = new Set<string>();
  const eventRetentionLimit = config.eventRetentionLimit ?? 100;
  const trustedPublicKeys = { ...(config.trustedPublicKeys ?? {}) };
  const counters: FederationBusStatus['counters'] = {
    heartbeatsReceived: 0,
    envelopesReceived: 0,
    onboardingsReceived: 0,
    kicksIssued: 0,
    driftsDetected: 0,
    slaveRollCallsReceived: 0,
  };
  const seededPeerUrls = new Set((config.peerUrls ?? []).map((entry) => normalizeBaseUrl(entry)));
  let latestSequence = 0;

  const upsertPeer = (input: {
    peerId: string;
    busUrl: string;
    adminUrl: string;
    capabilities?: string[];
    projectIds?: string[];
    role?: 'master' | 'slave';
    status?: 'active' | 'kicked';
  }): FederationPeerRecord => {
    const record: FederationPeerRecord = {
      peerId: input.peerId,
      busUrl: normalizeBaseUrl(input.busUrl),
      adminUrl: normalizeBaseUrl(input.adminUrl),
      capabilities: input.capabilities ?? [],
      projectIds: input.projectIds ?? [],
      role: input.role ?? 'master',
      status: input.status ?? 'active',
      lastSeen: nowIso(),
      connected: true,
      kickedAt: input.status === 'kicked' ? nowIso() : undefined,
    };
    peerMap.set(record.peerId, record);
    seededPeerUrls.add(record.busUrl);

    for (const projectId of record.projectIds) {
      const set = projectMap.get(projectId) ?? new Set<string>();
      set.add(record.peerId);
      projectMap.set(projectId, set);
    }

    return record;
  };

  const registerDrift = (sourceNodeId: string, envelope: EnvelopeV2): void => {
    if (envelope.verb !== 'status.updated' || !envelope.task_id) {
      return;
    }

    const metadata = typeof envelope.body.metadata === 'object' && envelope.body.metadata !== null
      ? envelope.body.metadata as Record<string, unknown>
      : undefined;
    if (!metadata) {
      return;
    }

    const digestHash = typeof metadata.digestHash === 'string' ? metadata.digestHash : undefined;
    const handoffHash = typeof metadata.handoffHash === 'string' ? metadata.handoffHash : undefined;
    const existing = taskContinuity.get(envelope.task_id);
    if (!existing) {
      taskContinuity.set(envelope.task_id, {
        projectId: envelope.project_id,
        digestHash,
        handoffHash,
      });
      return;
    }

    if (
      (!digestHash || !existing.digestHash || digestHash === existing.digestHash)
      && (!handoffHash || !existing.handoffHash || handoffHash === existing.handoffHash)
    ) {
      return;
    }

    counters.driftsDetected += 1;
    recentDrifts.push({
      taskId: envelope.task_id,
      projectId: envelope.project_id,
      reportedDigestHash: digestHash,
      expectedDigestHash: existing.digestHash,
      reportedHandoffHash: handoffHash,
      expectedHandoffHash: existing.handoffHash,
      detectedAt: nowIso(),
    });
    while (recentDrifts.length > eventRetentionLimit) {
      recentDrifts.shift();
    }

    if (config.debug) {
      console.warn('[federation-bus] drift detected', {
        sourceNodeId,
        taskId: envelope.task_id,
      });
    }
  };

  const forwardEnvelope = async (event: FederationBusEvent): Promise<void> => {
    const targets = new Set<string>(seededPeerUrls);
    for (const peer of peerMap.values()) {
      if (peer.status === 'active') {
        targets.add(peer.busUrl);
      }
    }

    await Promise.all(
      Array.from(targets)
        .filter((url) => url.length > 0)
        .map(async (url) => {
          try {
            await requestJson<PostToBusResult>(`${normalizeBaseUrl(url)}/events`, {
              method: 'POST',
              body: JSON.stringify({
                payload: {
                  sourceNodeId: config.nodeId,
                  envelope: event.envelope,
                  forwarded: true,
                },
              }),
            });
          } catch {
            // Best effort forwarding; the bus should continue serving local state.
          }
        }),
    );
  };

  const busServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${config.host}:${config.busPort}`}`);
      if (req.method === 'GET' && url.pathname === '/events') {
        const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10) || 0;
        const limit = Number.parseInt(url.searchParams.get('limit') ?? String(eventRetentionLimit), 10) || eventRetentionLimit;
        const filtered = events.filter((event) => event.sequence > since).slice(-Math.max(1, limit));
        writeJson(res, 200, {
          latestSequence,
          events: filtered,
        } satisfies FetchBusEventsResponse);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/events') {
        const signed = await parseSignedPayload(req, z.object({
          sourceNodeId: z.string().min(1),
          envelope: envelopeV2Schema,
          forwarded: z.boolean().optional(),
        }));
        validateSignedRequest({
          kind: 'events.post',
          signedBy: signed.signedBy,
          nonce: signed.nonce,
          signature: signed.signature,
          payload: signed.payload,
          trustedPublicKeys,
          enforceSignatures: config.enforceSignatures === true,
          seenNonces,
        });
        while (seenNonces.size > 1_000) {
          removeOldestNonce(seenNonces);
        }

        const { sourceNodeId, envelope, forwarded } = signed.payload;
        if (seenEnvelopeIds.has(envelope.id)) {
          writeJson(res, 200, {
            accepted: true,
            duplicate: true,
            sequence: latestSequence,
          } satisfies PostToBusResult);
          return;
        }

        seenEnvelopeIds.add(envelope.id);
        while (seenEnvelopeIds.size > 10_000) {
          const first = seenEnvelopeIds.values().next().value as string | undefined;
          if (!first) {
            break;
          }
          seenEnvelopeIds.delete(first);
        }

        latestSequence += 1;
        counters.envelopesReceived += 1;
        const event: FederationBusEvent = {
          sequence: latestSequence,
          receivedAt: nowIso(),
          sourceNodeId,
          envelope,
        };
        events.push(event);
        while (events.length > eventRetentionLimit) {
          events.shift();
        }

        if (sourceNodeId !== config.nodeId && peerMap.has(sourceNodeId)) {
          const existing = peerMap.get(sourceNodeId);
          if (existing) {
            existing.lastSeen = nowIso();
            existing.connected = existing.status === 'active';
          }
        }

        const projectPeers = projectMap.get(envelope.project_id) ?? new Set<string>();
        if (sourceNodeId !== config.nodeId) {
          projectPeers.add(sourceNodeId);
        }
        projectMap.set(envelope.project_id, projectPeers);

        registerDrift(sourceNodeId, envelope);
        if (!forwarded) {
          void forwardEnvelope(event);
        }

        writeJson(res, 200, {
          accepted: true,
          sequence: event.sequence,
        } satisfies PostToBusResult);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/heartbeat') {
        const signed = await parseSignedPayload(req, heartbeatPayloadSchema);
        validateSignedRequest({
          kind: 'heartbeat',
          signedBy: signed.signedBy,
          nonce: signed.nonce,
          signature: signed.signature,
          payload: signed.payload,
          trustedPublicKeys,
          enforceSignatures: config.enforceSignatures === true,
          seenNonces,
        });
        counters.heartbeatsReceived += 1;
        upsertPeer({
          peerId: signed.payload.peerId,
          busUrl: signed.payload.busUrl,
          adminUrl: signed.payload.adminUrl,
          capabilities: signed.payload.capabilities,
          projectIds: signed.payload.projectIds ?? [],
          role: signed.payload.role,
        });
        writeJson(res, 200, { accepted: true });
        return;
      }

      writeJson(res, 404, { error: 'Not found' });
    } catch (error) {
      writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const adminServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${config.host}:${config.adminPort}`}`);
      if (req.method === 'GET' && url.pathname === '/status') {
        const peers = Array.from(peerMap.values()).sort((left, right) => left.peerId.localeCompare(right.peerId));
        const projects = Array.from(projectMap.entries()).map(([projectId, peersForProject]) => ({
          projectId,
          peers: Array.from(peersForProject).sort(),
        }));

        writeJson(res, 200, {
          nodeId: config.nodeId,
          host: config.host,
          busPort: config.busPort,
          adminPort: config.adminPort,
          latestSequence,
          peerCount: peers.length,
          projectCount: projects.length,
          recentEventCount: events.length,
          recentDriftCount: recentDrifts.length,
          peers,
          projects,
          recentDrifts,
          counters,
        } satisfies FederationBusStatus);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/onboard') {
        const signed = await parseSignedPayload(req, onboardPayloadSchema);
        validateSignedRequest({
          kind: 'onboard',
          signedBy: signed.signedBy,
          nonce: signed.nonce,
          signature: signed.signature,
          payload: signed.payload,
          trustedPublicKeys,
          enforceSignatures: config.enforceSignatures === true,
          seenNonces,
        });
        counters.onboardingsReceived += 1;
        const projectIds = signed.payload.projectIds ?? (signed.payload.projectId ? [signed.payload.projectId] : []);
        upsertPeer({
          peerId: signed.payload.peerId,
          busUrl: signed.payload.busUrl,
          adminUrl: signed.payload.adminUrl,
          capabilities: signed.payload.capabilities,
          projectIds,
          role: signed.payload.role,
        });
        writeJson(res, 200, { accepted: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/kick') {
        const signed = await parseSignedPayload(req, kickPayloadSchema);
        validateSignedRequest({
          kind: 'kick',
          signedBy: signed.signedBy,
          nonce: signed.nonce,
          signature: signed.signature,
          payload: signed.payload,
          trustedPublicKeys,
          enforceSignatures: config.enforceSignatures === true,
          seenNonces,
        });
        counters.kicksIssued += 1;
        const existing = peerMap.get(signed.payload.peerId);
        if (existing) {
          existing.status = 'kicked';
          existing.connected = false;
          existing.kickedAt = nowIso();
          existing.lastSeen = nowIso();
        }
        writeJson(res, 200, { accepted: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/slave-roll-call') {
        const signed = await parseSignedPayload(req, slaveRollCallPayloadSchema);
        validateSignedRequest({
          kind: 'slave-roll-call',
          signedBy: signed.signedBy,
          nonce: signed.nonce,
          signature: signed.signature,
          payload: signed.payload,
          trustedPublicKeys,
          enforceSignatures: config.enforceSignatures === true,
          seenNonces,
        });
        counters.slaveRollCallsReceived += 1;
        upsertPeer({
          peerId: signed.payload.nodeId,
          busUrl: signed.payload.busUrl ?? '',
          adminUrl: signed.payload.adminUrl ?? '',
          capabilities: signed.payload.capabilities,
          projectIds: signed.payload.projectId ? [signed.payload.projectId] : [],
          role: 'slave',
        });
        if (signed.payload.publicKey) {
          trustedPublicKeys[signed.payload.nodeId] = signed.payload.publicKey;
        }

        const welcome = await config.onSlaveRollCall?.(signed.payload) ?? {
          accepted: true,
          nodeId: config.nodeId,
          swarmRole: 'master' as const,
          rulesHash: config.rulesHash ?? '',
          droidspeakCatalog: config.droidspeakCatalog ?? {},
          lawManifest: config.lawManifest ?? {},
          projectId: signed.payload.projectId,
        };
        writeJson(res, 200, welcome);
        return;
      }

      writeJson(res, 404, { error: 'Not found' });
    } catch (error) {
      writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  busServer.listen(config.busPort, config.host);
  adminServer.listen(config.adminPort, config.host);

  return {
    async close(): Promise<void> {
      await Promise.all([
        new Promise<void>((resolve, reject) => busServer.close((error) => error ? reject(error) : resolve())),
        new Promise<void>((resolve, reject) => adminServer.close((error) => error ? reject(error) : resolve())),
      ]);
    },
  };
};
