import { createHash, createPrivateKey, createPublicKey, randomUUID, sign as signPayload, verify as verifySignature } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

import { tracer } from '@shared-tracing';
import type { EnvelopeV2 } from '../../shared-types/src/index';
import { normalizeToEnvelopeV2 } from '../../shared-types/src/index';

export interface FederationPeerDescriptor {
  peerId: string;
  busUrl: string;
  adminUrl?: string;
  capabilities?: string[];
  projectIds?: string[];
  lastHeartbeatAt?: string;
  lastKickAt?: string;
}

export interface FederationProjectDescriptor {
  projectId: string;
  peers: string[];
  updatedAt: string;
}

export interface FederationDriftSummary {
  projectId: string;
  taskId: string;
  nodeId?: string;
  reportedDigestHash?: string;
  expectedDigestHash?: string;
  reportedHandoffHash?: string;
  expectedHandoffHash?: string;
  detail: string;
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
  peers: FederationPeerDescriptor[];
  projects: FederationProjectDescriptor[];
  recentEventCount: number;
  recentDriftCount: number;
  recentDrifts: FederationDriftSummary[];
  counters: {
    envelopesReceived: number;
    envelopesForwarded: number;
    heartbeatsReceived: number;
    kicksReceived: number;
    onboardingsReceived: number;
    driftsDetected: number;
  };
}

export interface FederationBusService {
  close(): Promise<void>;
  getStatus(): FederationBusStatus;
}

export interface StartFederationBusOptions {
  nodeId: string;
  host: string;
  busPort: number;
  adminPort: number;
  peerUrls?: string[];
  projectIds?: string[];
  debug?: boolean;
  heartbeatIntervalMs?: number;
  eventRetentionLimit?: number;
  signing?: FederationSigningConfig;
}

export interface FederationSigningConfig {
  keyId: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  trustedPublicKeys?: Record<string, string>;
  enforceVerification?: boolean;
}

export interface SignedRequestEnvelope<TPayload> {
  payload: TPayload;
  signedBy?: string;
  nonce?: string;
  signature?: string;
}

export interface FederationPostAuth {
  keyId: string;
  privateKeyPem: string;
}

export interface PostEnvelopeInput {
  envelope: EnvelopeV2;
  sourceNodeId?: string;
  forward?: boolean;
  signedBy?: string;
  nonce?: string;
  signature?: string;
}

export interface HeartbeatInput {
  peerId: string;
  busUrl: string;
  adminUrl?: string;
  capabilities?: string[];
  projectIds?: string[];
  ts?: string;
  signedBy?: string;
  nonce?: string;
  signature?: string;
}

export interface OnboardInput extends HeartbeatInput {
  projectId?: string;
}

export interface KickInput {
  peerId: string;
  targetBusUrl?: string;
  targetAdminUrl?: string;
  signedBy?: string;
  nonce?: string;
  signature?: string;
}

interface ContinuitySnapshot {
  digestHash?: string;
  handoffHash?: string;
  reportedAt: string;
}

const defaultHeaders = {
  'content-type': 'application/json; charset=utf-8',
};

const nowIso = (): string => new Date().toISOString();

const canonicalize = (value: unknown): string => JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());

const signedPayloadBody = (purpose: string, payload: Record<string, unknown>, signedBy: string, nonce: string): string =>
  canonicalize({ purpose, payload, signedBy, nonce });

export const signFederationRequest = <TPayload extends Record<string, unknown>>(
  purpose: string,
  payload: TPayload,
  auth: FederationPostAuth,
): SignedRequestEnvelope<TPayload> => {
  const nonce = randomUUID();
  const signature = signPayload(
    null,
    Buffer.from(signedPayloadBody(purpose, payload, auth.keyId, nonce), 'utf8'),
    createPrivateKey(auth.privateKeyPem),
  ).toString('base64');

  return {
    payload,
    signedBy: auth.keyId,
    nonce,
    signature,
  };
};

export const verifyFederationRequest = (
  purpose: string,
  payload: Record<string, unknown>,
  signedBy: string | undefined,
  nonce: string | undefined,
  signature: string | undefined,
  signing?: FederationSigningConfig,
): boolean => {
  if (!signing?.enforceVerification) {
    if (!signedBy || !nonce || !signature) {
      return true;
    }
  }

  if (!signedBy || !nonce || !signature) {
    return false;
  }

  const publicKeyPem =
    (signing?.trustedPublicKeys && signing.trustedPublicKeys[signedBy])
    ?? (signing?.keyId === signedBy ? signing.publicKeyPem : undefined);
  if (!publicKeyPem) {
    return false;
  }

  return verifySignature(
    null,
    Buffer.from(signedPayloadBody(purpose, payload, signedBy, nonce), 'utf8'),
    createPublicKey(publicKeyPem),
    Buffer.from(signature, 'base64'),
  );
};

const parsePeerUrl = (input: string): FederationPeerDescriptor | undefined => {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const busUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed.replace(/\/$/, '')
    : `http://${trimmed.replace(/\/$/, '')}`;
  const parsed = new URL(busUrl);
  const peerId = parsed.host.replace(/[^a-zA-Z0-9_.:-]/g, '-');
  const adminPort = parsed.port ? String(Number(parsed.port) + 3) : '4950';
  const adminUrl = `${parsed.protocol}//${parsed.hostname}:${adminPort}`;
  return {
    peerId,
    busUrl,
    adminUrl,
  };
};

export const parseFederationPeers = (value?: string): FederationPeerDescriptor[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => parsePeerUrl(entry))
    .filter((entry): entry is FederationPeerDescriptor => entry != null);
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const writeJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, defaultHeaders);
  response.end(JSON.stringify(payload));
};

const waitForServerListen = async (server: ReturnType<typeof createServer>, port: number, host: string): Promise<void> =>
  await new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });

const postJson = async <TResponse>(url: string, payload: unknown): Promise<TResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Federation request failed (${response.status}) for ${url}`);
  }
  return await response.json() as TResponse;
};

const getJson = async <TResponse>(url: string): Promise<TResponse> => {
  const response = await fetch(url, {
    headers: defaultHeaders,
  });
  if (!response.ok) {
    throw new Error(`Federation request failed (${response.status}) for ${url}`);
  }
  return await response.json() as TResponse;
};

export const postToBus = async (
  busUrl: string,
  input: PostEnvelopeInput,
  auth?: FederationPostAuth,
): Promise<{ accepted: boolean; duplicate?: boolean; sequence: number }> => {
  const unsignedPayload = {
    envelope: input.envelope,
    sourceNodeId: input.sourceNodeId,
    forward: input.forward,
  } satisfies Record<string, unknown>;
  const signed = auth ? signFederationRequest('bus', unsignedPayload, auth) : undefined;
  tracer.audit('FEDERATION_MESSAGE_OUTBOUND', {
    busUrl,
    envelopeId: input.envelope.id,
    verb: input.envelope.verb,
    taskId: input.envelope.task_id,
    roomId: input.envelope.room_id,
    forward: input.forward,
  });
  return postJson(`${busUrl.replace(/\/$/, '')}/bus`, {
    ...unsignedPayload,
    signedBy: signed?.signedBy ?? input.signedBy,
    nonce: signed?.nonce ?? input.nonce,
    signature: signed?.signature ?? input.signature,
  });
};

export const sendHeartbeat = async (busUrl: string, input: HeartbeatInput, auth?: FederationPostAuth): Promise<{ accepted: boolean }> => {
  const unsignedPayload = {
    peerId: input.peerId,
    busUrl: input.busUrl,
    adminUrl: input.adminUrl,
    capabilities: input.capabilities,
    projectIds: input.projectIds,
    ts: input.ts,
  } satisfies Record<string, unknown>;
  const signed = auth ? signFederationRequest('heartbeat', unsignedPayload, auth) : undefined;
  tracer.audit('FEDERATION_HEARTBEAT_OUTBOUND', {
    busUrl,
    peerId: input.peerId,
    adminUrl: input.adminUrl,
    capabilities: input.capabilities,
    projectIds: input.projectIds,
  });
  return postJson(`${busUrl.replace(/\/$/, '')}/heartbeat`, {
    ...unsignedPayload,
    signedBy: signed?.signedBy ?? input.signedBy,
    nonce: signed?.nonce ?? input.nonce,
    signature: signed?.signature ?? input.signature,
  });
};

export const onboardPeer = async (
  adminUrl: string,
  input: OnboardInput,
  auth?: FederationPostAuth,
): Promise<{ accepted: boolean; peerId: string }> => {
  const projectIds = Array.from(new Set([
    ...(input.projectIds ?? []),
    ...(input.projectId ? [input.projectId] : []),
  ]));
  const unsignedPayload = {
    peerId: input.peerId,
    busUrl: input.busUrl,
    adminUrl: input.adminUrl,
    capabilities: input.capabilities,
    projectIds,
    ts: input.ts,
  } satisfies Record<string, unknown>;
  const signed = auth ? signFederationRequest('onboard', unsignedPayload, auth) : undefined;
  tracer.audit('FEDERATION_ONBOARD_OUTBOUND', {
    adminUrl,
    peerId: input.peerId,
    busUrl: input.busUrl,
    projectIds,
  });
  return postJson(`${adminUrl.replace(/\/$/, '')}/onboard`, {
    ...unsignedPayload,
    signedBy: signed?.signedBy ?? input.signedBy,
    nonce: signed?.nonce ?? input.nonce,
    signature: signed?.signature ?? input.signature,
  });
};

export const kickPeer = async (adminUrl: string, input: KickInput, auth?: FederationPostAuth): Promise<{ accepted: boolean }> => {
  const unsignedPayload = {
    peerId: input.peerId,
    targetBusUrl: input.targetBusUrl,
    targetAdminUrl: input.targetAdminUrl,
  } satisfies Record<string, unknown>;
  const signed = auth ? signFederationRequest('kick', unsignedPayload, auth) : undefined;
  tracer.audit('FEDERATION_KICK_OUTBOUND', {
    adminUrl,
    peerId: input.peerId,
    targetBusUrl: input.targetBusUrl,
    targetAdminUrl: input.targetAdminUrl,
  });
  return postJson(`${adminUrl.replace(/\/$/, '')}/kick`, {
    ...unsignedPayload,
    signedBy: signed?.signedBy ?? input.signedBy,
    nonce: signed?.nonce ?? input.nonce,
    signature: signed?.signature ?? input.signature,
  });
};

export const fetchBusStatus = async (adminUrl: string): Promise<FederationBusStatus> =>
  getJson(`${adminUrl.replace(/\/$/, '')}/status`);

export const fetchBusEvents = async (
  busUrl: string,
  afterSequence = 0,
  limit = 50,
): Promise<{ events: FederationBusEvent[]; latestSequence: number }> =>
  getJson(`${busUrl.replace(/\/$/, '')}/events?after=${afterSequence}&limit=${limit}`);

export const startFederationBus = (options: StartFederationBusOptions): FederationBusService => {
  const peers = new Map<string, FederationPeerDescriptor>();
  const events: FederationBusEvent[] = [];
  const projects = new Map<string, FederationProjectDescriptor>();
  const recentDrifts: FederationDriftSummary[] = [];
  const seenEnvelopeIds = new Set<string>();
  const seenRequestIds = new Set<string>();
  const continuityByTask = new Map<string, Map<string, ContinuitySnapshot>>();
  let sequence = 0;
  const retentionLimit = Math.max(25, options.eventRetentionLimit ?? 200);
  const heartbeatIntervalMs = Math.max(5_000, options.heartbeatIntervalMs ?? 15_000);
  const localProjects = Array.from(new Set(options.projectIds ?? []));
  const counters = {
    envelopesReceived: 0,
    envelopesForwarded: 0,
    heartbeatsReceived: 0,
    kicksReceived: 0,
    onboardingsReceived: 0,
    driftsDetected: 0,
  };

  for (const peer of options.peerUrls ?? []) {
    const parsed = parsePeerUrl(peer);
    if (parsed) {
      peers.set(parsed.peerId, parsed);
    }
  }

  const log = (...args: unknown[]) => {
    if (options.debug) {
      console.log('[FederationBus]', ...args);
    }
  };

  const rememberRequest = (purpose: string, signedBy?: string, nonce?: string): boolean => {
    const replayKey = signedBy && nonce ? `${purpose}:${signedBy}:${nonce}` : undefined;
    if (!replayKey) {
      return false;
    }
    if (seenRequestIds.has(replayKey)) {
      return true;
    }
    seenRequestIds.add(replayKey);
    while (seenRequestIds.size > retentionLimit * 4) {
      const [oldest] = seenRequestIds;
      if (!oldest) {
        break;
      }
      seenRequestIds.delete(oldest);
    }
    return false;
  };

  const rememberEvent = (sourceNodeId: string, envelope: EnvelopeV2): FederationBusEvent => {
    sequence += 1;
    const event: FederationBusEvent = {
      sequence,
      receivedAt: nowIso(),
      sourceNodeId,
      envelope,
    };
    events.push(event);
    seenEnvelopeIds.add(envelope.id);
    while (events.length > retentionLimit) {
      const removed = events.shift();
      if (removed) {
        seenEnvelopeIds.delete(removed.envelope.id);
      }
    }
    return event;
  };

  const forwardEnvelope = async (sourceNodeId: string, envelope: EnvelopeV2): Promise<void> => {
    const targets = [...peers.values()].filter((peer) => peer.peerId !== sourceNodeId && peer.peerId !== options.nodeId);
    await Promise.allSettled(targets.map(async (peer) => {
      try {
        await postToBus(peer.busUrl, {
          envelope,
          sourceNodeId: options.nodeId,
          forward: false,
        });
        counters.envelopesForwarded += 1;
      } catch (error) {
        log('peer.forward.failed', { peerId: peer.peerId, error: error instanceof Error ? error.message : String(error) });
      }
    }));
  };

  const mergeProjectMembership = (peerId: string, inputProjectIds?: string[]): void => {
    const projectIds = Array.from(new Set(inputProjectIds?.filter((entry) => typeof entry === 'string' && entry.length > 0) ?? []));
    for (const projectId of projectIds) {
      const existing = projects.get(projectId);
      const peersForProject = new Set(existing?.peers ?? []);
      peersForProject.add(peerId);
      projects.set(projectId, {
        projectId,
        peers: [...peersForProject].sort(),
        updatedAt: nowIso(),
      });
    }
  };

  mergeProjectMembership(options.nodeId, localProjects);

  const updatePeer = (input: HeartbeatInput): void => {
    const existing = peers.get(input.peerId);
    const projectIds = Array.from(new Set(input.projectIds ?? existing?.projectIds ?? []));
    peers.set(input.peerId, {
      peerId: input.peerId,
      busUrl: input.busUrl.replace(/\/$/, ''),
      adminUrl: input.adminUrl?.replace(/\/$/, '') ?? existing?.adminUrl,
      capabilities: input.capabilities ?? existing?.capabilities,
      projectIds,
      lastHeartbeatAt: input.ts ?? nowIso(),
      lastKickAt: existing?.lastKickAt,
    });
    mergeProjectMembership(input.peerId, projectIds);
  };

  const getEnvelopeMetadata = (envelope: EnvelopeV2): Record<string, unknown> | undefined => {
    const bodyMetadata =
      typeof envelope.body.metadata === 'object' && envelope.body.metadata !== null
        ? envelope.body.metadata as Record<string, unknown>
        : undefined;
    const payload =
      typeof envelope.body.payload === 'object' && envelope.body.payload !== null
        ? envelope.body.payload as Record<string, unknown>
        : undefined;
    const payloadMetadata =
      payload && typeof payload.metadata === 'object' && payload.metadata !== null
        ? payload.metadata as Record<string, unknown>
        : undefined;
    return bodyMetadata ?? payloadMetadata;
  };

  const recordDrift = (drift: FederationDriftSummary): void => {
    recentDrifts.push(drift);
    counters.driftsDetected += 1;
    while (recentDrifts.length > retentionLimit) {
      recentDrifts.shift();
    }
  };

  const evaluateContinuityDrift = (sourceNodeId: string, envelope: EnvelopeV2): void => {
    if (!envelope.task_id) {
      return;
    }
    const metadata = getEnvelopeMetadata(envelope);
    const digestHash = typeof metadata?.digestHash === 'string' ? metadata.digestHash : undefined;
    const handoffHash = typeof metadata?.handoffHash === 'string' ? metadata.handoffHash : undefined;
    if (!digestHash && !handoffHash) {
      return;
    }

    const continuityKey = `${envelope.project_id}:${envelope.task_id}`;
    const snapshots = continuityByTask.get(continuityKey) ?? new Map<string, ContinuitySnapshot>();
    continuityByTask.set(continuityKey, snapshots);
    const current: ContinuitySnapshot = {
      digestHash,
      handoffHash,
      reportedAt: envelope.ts,
    };

    for (const [peerId, prior] of snapshots.entries()) {
      if (peerId === sourceNodeId) {
        continue;
      }
      const digestMismatch = digestHash && prior.digestHash && digestHash !== prior.digestHash;
      const handoffMismatch = handoffHash && prior.handoffHash && handoffHash !== prior.handoffHash;
      if (!digestMismatch && !handoffMismatch) {
        continue;
      }
      recordDrift({
        projectId: envelope.project_id,
        taskId: envelope.task_id,
        nodeId: sourceNodeId,
        reportedDigestHash: digestHash,
        expectedDigestHash: prior.digestHash,
        reportedHandoffHash: handoffHash,
        expectedHandoffHash: prior.handoffHash,
        detail: `Continuity drift detected for ${envelope.task_id} between ${peerId} and ${sourceNodeId}.`,
        detectedAt: nowIso(),
      });
      break;
    }

    snapshots.set(sourceNodeId, current);
    while (snapshots.size > retentionLimit) {
      const [oldestKey] = snapshots.keys();
      if (!oldestKey) {
        break;
      }
      snapshots.delete(oldestKey);
    }
  };

  const busServer = createServer(async (request, response) => {
    if (!request.url) {
      writeJson(response, 404, { error: 'missing_url' });
      return;
    }
    const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);

    if (request.method === 'POST' && url.pathname === '/bus') {
      const body = await readJsonBody(request) as Record<string, unknown>;
      const unsignedPayload = {
        envelope: body.envelope ?? body,
        sourceNodeId: typeof body.sourceNodeId === 'string' ? body.sourceNodeId : options.nodeId,
        forward: body.forward,
      } satisfies Record<string, unknown>;
      if (!verifyFederationRequest(
        'bus',
        unsignedPayload,
        typeof body.signedBy === 'string' ? body.signedBy : undefined,
        typeof body.nonce === 'string' ? body.nonce : undefined,
        typeof body.signature === 'string' ? body.signature : undefined,
        options.signing,
      )) {
        writeJson(response, 403, { accepted: false, error: 'invalid_signature' });
        return;
      }
      if (rememberRequest('bus', typeof body.signedBy === 'string' ? body.signedBy : undefined, typeof body.nonce === 'string' ? body.nonce : undefined)) {
        writeJson(response, 200, { accepted: true, duplicate: true, sequence });
        return;
      }
      const envelope = normalizeToEnvelopeV2(body.envelope ?? body);
      const sourceNodeId = typeof body.sourceNodeId === 'string' ? body.sourceNodeId : options.nodeId;
      const shouldForward = body.forward !== false;

      if (seenEnvelopeIds.has(envelope.id)) {
        writeJson(response, 200, { accepted: true, duplicate: true, sequence });
        return;
      }

      counters.envelopesReceived += 1;
      const event = rememberEvent(sourceNodeId, envelope);
      mergeProjectMembership(sourceNodeId, [envelope.project_id]);
      evaluateContinuityDrift(sourceNodeId, envelope);
      if (envelope.verb === 'drift.detected') {
        recordDrift({
          projectId: envelope.project_id,
          taskId: envelope.task_id ?? envelope.room_id,
          nodeId: sourceNodeId,
          reportedDigestHash: typeof envelope.body.reportedDigestHash === 'string' ? envelope.body.reportedDigestHash : undefined,
          expectedDigestHash: typeof envelope.body.expectedDigestHash === 'string' ? envelope.body.expectedDigestHash : undefined,
          reportedHandoffHash: typeof envelope.body.reportedHandoffHash === 'string' ? envelope.body.reportedHandoffHash : undefined,
          expectedHandoffHash: typeof envelope.body.expectedHandoffHash === 'string' ? envelope.body.expectedHandoffHash : undefined,
          detail: typeof envelope.body.detail === 'string' ? envelope.body.detail : `Federation drift detected for ${envelope.task_id ?? envelope.room_id}.`,
          detectedAt: typeof envelope.body.detectedAt === 'string' ? envelope.body.detectedAt : nowIso(),
        });
      }
      tracer.audit('FEDERATION_MESSAGE_INBOUND', {
        sourceNodeId,
        envelopeId: envelope.id,
        verb: envelope.verb,
        taskId: envelope.task_id,
        roomId: envelope.room_id,
        forwarded: shouldForward,
      });
      log('bus.envelope', { id: envelope.id, verb: envelope.verb, sourceNodeId });

      if (shouldForward) {
        void forwardEnvelope(sourceNodeId, envelope);
      }

      writeJson(response, 200, { accepted: true, sequence: event.sequence });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/heartbeat') {
      const body = await readJsonBody(request) as HeartbeatInput;
      if (!verifyFederationRequest(
        'heartbeat',
        {
          peerId: body.peerId,
          busUrl: body.busUrl,
          adminUrl: body.adminUrl,
          capabilities: body.capabilities,
          projectIds: body.projectIds,
          ts: body.ts,
        },
        body.signedBy,
        body.nonce,
        body.signature,
        options.signing,
      )) {
        writeJson(response, 403, { accepted: false, error: 'invalid_signature' });
        return;
      }
      if (rememberRequest('heartbeat', body.signedBy, body.nonce)) {
        writeJson(response, 200, { accepted: true });
        return;
      }
      counters.heartbeatsReceived += 1;
      updatePeer(body);
      tracer.audit('FEDERATION_HEARTBEAT_INBOUND', {
        peerId: body.peerId,
        busUrl: body.busUrl,
        adminUrl: body.adminUrl,
        capabilities: body.capabilities,
        projectIds: body.projectIds,
      });
      writeJson(response, 200, { accepted: true });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/events') {
      const after = Number(url.searchParams.get('after') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const selected = events
        .filter((event) => event.sequence > after)
        .slice(0, Math.max(1, Math.min(200, limit)));
      writeJson(response, 200, {
        events: selected,
        latestSequence: sequence,
      });
      return;
    }

    writeJson(response, 404, { error: 'not_found' });
  });

  const adminServer = createServer(async (request, response) => {
    if (!request.url) {
      writeJson(response, 404, { error: 'missing_url' });
      return;
    }
    const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);

    if (request.method === 'GET' && url.pathname === '/status') {
      writeJson(response, 200, {
        nodeId: options.nodeId,
        host: options.host,
        busPort: options.busPort,
        adminPort: options.adminPort,
        latestSequence: sequence,
        peerCount: peers.size,
        projectCount: projects.size,
        peers: [...peers.values()],
        projects: [...projects.values()],
        recentEventCount: events.length,
        recentDriftCount: recentDrifts.length,
        recentDrifts,
        counters,
      } satisfies FederationBusStatus);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/onboard') {
      const body = await readJsonBody(request) as OnboardInput;
      const projectIds = Array.from(new Set([
        ...(body.projectIds ?? []),
        ...(body.projectId ? [body.projectId] : []),
      ]));
      if (!verifyFederationRequest(
        'onboard',
        {
          peerId: body.peerId,
          busUrl: body.busUrl,
          adminUrl: body.adminUrl,
          capabilities: body.capabilities,
          projectIds,
          ts: body.ts,
        },
        body.signedBy,
        body.nonce,
        body.signature,
        options.signing,
      )) {
        writeJson(response, 403, { accepted: false, error: 'invalid_signature' });
        return;
      }
      if (rememberRequest('onboard', body.signedBy, body.nonce)) {
        writeJson(response, 200, { accepted: true, peerId: body.peerId });
        return;
      }
      counters.onboardingsReceived += 1;
      updatePeer({
        ...body,
        projectIds,
      });
      tracer.audit('FEDERATION_ONBOARD_INBOUND', {
        peerId: body.peerId,
        busUrl: body.busUrl,
        adminUrl: body.adminUrl,
        projectIds,
      });
      writeJson(response, 200, { accepted: true, peerId: body.peerId });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/kick') {
      const body = await readJsonBody(request) as KickInput;
      if (!verifyFederationRequest(
        'kick',
        {
          peerId: body.peerId,
          targetBusUrl: body.targetBusUrl,
          targetAdminUrl: body.targetAdminUrl,
        },
        body.signedBy,
        body.nonce,
        body.signature,
        options.signing,
      )) {
        writeJson(response, 403, { accepted: false, error: 'invalid_signature' });
        return;
      }
      if (rememberRequest('kick', body.signedBy, body.nonce)) {
        writeJson(response, 200, { accepted: true });
        return;
      }
      counters.kicksReceived += 1;
      tracer.audit('FEDERATION_KICK_INBOUND', {
        peerId: body.peerId,
        targetBusUrl: body.targetBusUrl,
        targetAdminUrl: body.targetAdminUrl,
      });
      const peer = peers.get(body.peerId);
      const targetBusUrl = body.targetBusUrl ?? peer?.busUrl;
      if (!targetBusUrl) {
        writeJson(response, 400, { accepted: false, error: 'unknown_peer' });
        return;
      }
      await sendHeartbeat(targetBusUrl, {
        peerId: options.nodeId,
        busUrl: `http://127.0.0.1:${options.busPort}`,
        adminUrl: `http://127.0.0.1:${options.adminPort}`,
        capabilities: ['envelope-v2', 'heartbeat', 'kick', 'onboard', 'drift-detection'],
        projectIds: localProjects,
      });
      if (peer) {
        peers.set(peer.peerId, {
          ...peer,
          lastKickAt: nowIso(),
        });
      }
      writeJson(response, 200, { accepted: true });
      return;
    }

    writeJson(response, 404, { error: 'not_found' });
  });

  const heartbeatTimer = setInterval(() => {
    const heartbeat: HeartbeatInput = {
      peerId: options.nodeId,
      busUrl: `http://127.0.0.1:${options.busPort}`,
      adminUrl: `http://127.0.0.1:${options.adminPort}`,
      capabilities: ['envelope-v2', 'heartbeat', 'kick', 'onboard', 'drift-detection'],
      projectIds: localProjects,
      ts: nowIso(),
    };
    for (const peer of peers.values()) {
      void sendHeartbeat(peer.busUrl, heartbeat).catch((error) => {
        log('heartbeat.failed', { peerId: peer.peerId, error: error instanceof Error ? error.message : String(error) });
      });
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const startup = Promise.all([
    waitForServerListen(busServer, options.busPort, options.host),
    waitForServerListen(adminServer, options.adminPort, options.host),
  ]);

  return {
    getStatus: () => ({
      nodeId: options.nodeId,
      host: options.host,
      busPort: options.busPort,
      adminPort: options.adminPort,
      latestSequence: sequence,
      peerCount: peers.size,
      projectCount: projects.size,
      peers: [...peers.values()],
      projects: [...projects.values()],
      recentEventCount: events.length,
      recentDriftCount: recentDrifts.length,
      recentDrifts,
      counters,
    }),
    close: async () => {
      clearInterval(heartbeatTimer);
      await startup.catch(() => undefined);
      await Promise.all([
        new Promise<void>((resolve, reject) => busServer.close((error) => error ? reject(error) : resolve())),
        new Promise<void>((resolve, reject) => adminServer.close((error) => error ? reject(error) : resolve())),
      ]);
    },
  };
};
