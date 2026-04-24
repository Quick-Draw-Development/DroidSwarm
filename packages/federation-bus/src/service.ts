import { loadFederationNodeConfig } from '@shared-config';
import { DROIDSPEAK_CATALOGS } from '@shared-droidspeak';
import { computeLawManifestHash, listActiveLaws } from '@shared-governance';

import { startFederationBus } from './index';
import { beginSlaveOnboarding, registerSlaveRollCall } from './slave-onboarding-supervisor';

// Service configuration
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_BUS_PORT = 4947;
const DEFAULT_ADMIN_PORT = 4950;

// Start the federation bus service
export const startFederationBusService = () => {
  const host = process.env.DROIDSWARM_FEDERATION_HOST || DEFAULT_HOST;
  const busPort = parseInt(process.env.DROIDSWARM_FEDERATION_BUS_PORT || DEFAULT_BUS_PORT.toString(), 10);
  const adminPort = parseInt(process.env.DROIDSWARM_FEDERATION_ADMIN_PORT || DEFAULT_ADMIN_PORT.toString(), 10);
  const node = loadFederationNodeConfig();

  const bus = startFederationBus({
    nodeId: node.nodeId,
    host,
    busPort,
    adminPort,
    peerUrls: (process.env.DROIDSWARM_FEDERATION_PEERS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    swarmRole: node.swarmRole,
    rulesHash: computeLawManifestHash(listActiveLaws()),
    droidspeakCatalog: DROIDSPEAK_CATALOGS as unknown as Record<string, unknown>,
    lawManifest: { laws: listActiveLaws() } as unknown as Record<string, unknown>,
    onSlaveRollCall: async (payload) => registerSlaveRollCall(payload),
  });
  console.log(`Federation Bus service listening on ${host}:${busPort} (admin ${adminPort})`);
  void beginSlaveOnboarding();
  return bus;
};

// If this file is run directly, start the service
if (require.main === module) {
  startFederationBusService();
}
