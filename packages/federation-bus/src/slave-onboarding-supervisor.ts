import { loadFederationNodeConfig, loadSharedConfig } from '@shared-config';
import { buildDroidspeakCatalogs } from '@shared-droidspeak';
import { computeLawManifestHash, computeSystemStateHash, createDriftSnapshot, listActiveLaws, validateCompliance } from '@shared-governance';
import { createLongTermMemory, listLongTermMemories } from '@shared-memory';
import { refreshModelInventory } from '@shared-models';
import { registerFederatedNode, upsertRegisteredModel, upsertSkillEvolutionProposal } from '@shared-projects';
import { buildDynamicSkillVerbCatalog, listEvolutionProposals, listRegisteredSkillManifests, listSpecializedAgents } from '@shared-skills';
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
  modelInventory: refreshModelInventory({
    nodeId: loadFederationNodeConfig().nodeId,
    persist: true,
  }).models.map((model) => ({
    nodeId: model.nodeId,
    modelId: model.modelId,
    displayName: model.displayName,
    backend: model.backend,
    path: model.path,
    quantization: model.quantization,
    contextLength: model.contextLength,
    sizeBytes: model.sizeBytes,
    toolUse: model.toolUse,
    reasoningDepth: model.reasoningDepth,
    speedTier: model.speedTier,
    enabled: model.enabled,
    tags: model.tags,
    metadata: model.metadata,
    source: 'federation-sync',
  })),
  recentMemories: listLongTermMemories({
    projectId: payload.projectId ?? loadSharedConfig().projectId,
    limit: 12,
  }),
  evolutionProposals: listEvolutionProposals(payload.projectId ?? loadSharedConfig().projectId).slice(0, 12),
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
  for (const model of payload.modelInventory ?? []) {
    upsertRegisteredModel({
      ...model,
      nodeId: payload.nodeId,
      source: 'federation-sync',
    });
  }
  appendAuditEvent('FEDERATION_SLAVE_ROLL_CALL', {
    nodeId: payload.nodeId,
    projectId: payload.projectId ?? shared.projectId,
    host: payload.host,
    modelCount: payload.modelInventory?.length ?? 0,
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
    modelInventory: refreshModelInventory({
      nodeId: node.nodeId,
      persist: true,
    }).models.map((model) => ({
      nodeId: model.nodeId,
      modelId: model.modelId,
      displayName: model.displayName,
      backend: model.backend,
      path: model.path,
      quantization: model.quantization,
      contextLength: model.contextLength,
      sizeBytes: model.sizeBytes,
      toolUse: model.toolUse,
      reasoningDepth: model.reasoningDepth,
      speedTier: model.speedTier,
      enabled: model.enabled,
      tags: model.tags,
      metadata: model.metadata,
      source: 'federation-sync',
    })),
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
    modelCount: welcome.modelInventory?.length ?? 0,
  });
  for (const model of welcome.modelInventory ?? []) {
    upsertRegisteredModel({
      ...model,
      nodeId: model.nodeId,
      source: 'federation-sync',
    });
  }
  for (const memory of welcome.recentMemories ?? []) {
    createLongTermMemory({
      projectId: memory.projectId,
      sessionId: memory.sessionId,
      scope: memory.scope,
      memoryType: memory.memoryType,
      droidspeakSummary: memory.droidspeakSummary,
      englishTranslation: memory.englishTranslation,
      sourceEventHash: memory.sourceEventHash,
      sourceTaskId: memory.sourceTaskId,
      sourceRunId: memory.sourceRunId,
      relevanceScore: memory.relevanceScore,
      embedding: memory.embedding,
      metadata: {
        ...memory.metadata,
        source: 'federation-sync',
        remoteMemoryId: memory.memoryId,
      },
      expiresAt: memory.expiresAt,
    });
  }
  for (const proposal of welcome.evolutionProposals ?? []) {
    upsertSkillEvolutionProposal({
      proposalId: proposal.proposalId,
      projectId: proposal.projectId,
      proposalType: proposal.proposalType,
      targetSkill: proposal.targetSkill,
      title: proposal.title,
      description: proposal.description,
      rationale: proposal.rationale,
      proposedBy: proposal.proposedBy,
      status: proposal.status,
      manifest: proposal.manifest,
      stubFiles: proposal.stubFiles,
      consensusId: proposal.consensusId,
      auditHash: proposal.auditHash,
    });
  }
  return welcome;
};
