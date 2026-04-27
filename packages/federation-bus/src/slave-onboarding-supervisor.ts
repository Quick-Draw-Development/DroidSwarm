import { loadFederationNodeConfig, loadSharedConfig } from '@shared-config';
import { buildDroidspeakCatalogs } from '@shared-droidspeak';
import { computeLawManifestHash, computeSystemStateHash, createDriftSnapshot, listActiveLaws, validateCompliance } from '@shared-governance';
import { registerFederatedNode } from '@shared-projects';
import { buildDynamicSkillVerbCatalog, listRegisteredSkillManifests, listSpecializedAgents } from '@shared-skills';
import { appendAuditEvent } from '@shared-tracing';

import { rollCallSlave, type FederationSigningKey, type SlaveRollCallPayload, type SlaveWelcomeResponse } from './index';

export const createSlaveOnboardingWelcome = (payload: SlaveRollCallPayload): SlaveWelcomeResponse => ({
  accepted: true,
  nodeId: loadFederationNodeConfig().nodeId,
  swarmRole: 'master',
  rulesHash: computeLawManifestHash(listActiveLaws()),
  droidspeakCatalog: buildDroidspeakCatalogs({ verbs: buildDynamicSkillVerbCatalog() }) as unknown as Record<string, unknown>,
  lawManifest: { laws: listActiveLaws() } as unknown as Record<string, unknown>,
  skillManifest: { skills: listRegisteredSkillManifests() } as unknown as Record<string, unknown>,
  agentManifest: { agents: listSpecializedAgents() } as unknown as Record<string, unknown>,
  systemStateHash: computeSystemStateHash(),
  projectId: payload.projectId ?? loadSharedConfig().projectId,
});

export const registerSlaveRollCall = (payload: SlaveRollCallPayload): SlaveWelcomeResponse => {
  const shared = loadSharedConfig();
  const enforcement = validateCompliance({
    eventType: 'federation.message',
    actorRole: 'slave',
    swarmRole: 'slave',
    dashboardEnabled: false,
    auditLoggingEnabled: true,
    projectId: payload.projectId ?? shared.projectId,
    droidspeakState: {
      compact: 'EVT-LAW-UPDATE',
      expanded: payload.nodeId,
      kind: 'federation_delta',
    },
  });
  if (!enforcement.ok) {
    return {
      accepted: false,
      nodeId: loadFederationNodeConfig().nodeId,
      swarmRole: 'master',
      rulesHash: enforcement.lawHash,
      droidspeakCatalog: buildDroidspeakCatalogs({ verbs: buildDynamicSkillVerbCatalog() }) as unknown as Record<string, unknown>,
      lawManifest: { laws: listActiveLaws() } as unknown as Record<string, unknown>,
      skillManifest: { skills: listRegisteredSkillManifests() } as unknown as Record<string, unknown>,
      agentManifest: { agents: listSpecializedAgents() } as unknown as Record<string, unknown>,
      systemStateHash: computeSystemStateHash(),
      projectId: payload.projectId ?? shared.projectId,
      reason: enforcement.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '),
    };
  }

  if (payload.systemStateHash) {
    createDriftSnapshot({
      nodeId: payload.nodeId,
      projectId: payload.projectId ?? shared.projectId,
      remoteHash: payload.systemStateHash,
      source: 'slave-roll-call',
    });
  }

  registerFederatedNode({
    nodeId: payload.nodeId,
    swarmRole: 'slave',
    host: payload.host,
    busUrl: payload.busUrl,
    adminUrl: payload.adminUrl,
    projectId: payload.projectId ?? shared.projectId,
    version: payload.version,
    publicKey: payload.publicKey,
    rulesHash: computeLawManifestHash(listActiveLaws()),
    hardwareFingerprintHash: payload.hardwareFingerprintHash,
    capabilities: payload.capabilities,
  });
  appendAuditEvent('FEDERATION_SLAVE_ROLL_CALL', {
    nodeId: payload.nodeId,
    projectId: payload.projectId ?? shared.projectId,
    host: payload.host,
  });
  return createSlaveOnboardingWelcome(payload);
};

export const beginSlaveOnboarding = async (input?: {
  connectTo?: string;
  adminPort?: number;
  signingKey?: FederationSigningKey;
}): Promise<SlaveWelcomeResponse | undefined> => {
  const shared = loadSharedConfig();
  const node = loadFederationNodeConfig();
  const connectTo = input?.connectTo ?? node.connectTo;
  if (!connectTo || node.swarmRole !== 'slave') {
    return undefined;
  }

  const adminPort = input?.adminPort ?? Number.parseInt(process.env.DROIDSWARM_FEDERATION_MASTER_ADMIN_PORT ?? '4950', 10);
  const adminUrl = /^https?:\/\//.test(connectTo)
    ? connectTo
    : `http://${connectTo}:${adminPort}`;
  const welcome = await rollCallSlave(adminUrl, {
    nodeId: node.nodeId,
    host: process.env.DROIDSWARM_FEDERATION_HOST ?? '127.0.0.1',
    busUrl: node.busUrl,
    adminUrl: node.adminUrl,
    version: process.env.DROIDSWARM_VERSION,
    projectId: shared.projectId,
    hardwareFingerprintHash: node.hardwareFingerprintHash,
    publicKey: node.keyPair.publicKeyPem,
    capabilities: ['envelope-v2', 'slave-onboarding', 'audit-log'],
    role: 'slave',
    systemStateHash: computeSystemStateHash(),
    ts: new Date().toISOString(),
  }, input?.signingKey ?? {
    keyId: node.nodeId,
    privateKeyPem: node.keyPair.privateKeyPem,
  });

  if (welcome.rulesHash !== computeLawManifestHash(listActiveLaws())) {
    appendAuditEvent('FEDERATION_LAW_HASH_MISMATCH', {
      nodeId: node.nodeId,
      localRulesHash: computeLawManifestHash(listActiveLaws()),
      remoteRulesHash: welcome.rulesHash,
    });
  }
  if (welcome.systemStateHash) {
    createDriftSnapshot({
      nodeId: node.nodeId,
      projectId: shared.projectId,
      remoteHash: welcome.systemStateHash,
      source: 'master-welcome',
    });
  }

  registerFederatedNode({
    nodeId: node.nodeId,
    swarmRole: 'slave',
    host: process.env.DROIDSWARM_FEDERATION_HOST ?? '127.0.0.1',
    busUrl: node.busUrl,
    adminUrl: node.adminUrl,
    projectId: shared.projectId,
    publicKey: node.keyPair.publicKeyPem,
    rulesHash: welcome.rulesHash,
    capabilities: ['envelope-v2', 'slave-onboarding', 'audit-log'],
  });
  appendAuditEvent('FEDERATION_SLAVE_WELCOME', {
    nodeId: node.nodeId,
    accepted: welcome.accepted,
    rulesHash: welcome.rulesHash,
    systemStateHash: welcome.systemStateHash,
  });
  return welcome;
};
