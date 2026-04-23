import { parseFederationPeers, startFederationBus } from './index';

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBooleanFlag = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const startFromEnvironment = () => startFederationBus({
  nodeId: process.env.DROIDSWARM_FEDERATION_NODE_ID ?? process.env.DROIDSWARM_SWARM_ID ?? 'droidswarm-local',
  host: process.env.DROIDSWARM_FEDERATION_HOST ?? '0.0.0.0',
  busPort: toPositiveInt(process.env.DROIDSWARM_FEDERATION_BUS_PORT, 4947),
  adminPort: toPositiveInt(process.env.DROIDSWARM_FEDERATION_ADMIN_PORT, 4950),
  peerUrls: parseFederationPeers(process.env.DROIDSWARM_FEDERATION_PEERS).map((peer) => peer.busUrl),
  projectIds: Array.from(new Set([
    process.env.DROIDSWARM_PROJECT_ID,
    ...(process.env.DROIDSWARM_ALLOWED_PROJECT_IDS?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? []),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))),
  debug: toBooleanFlag(process.env.DROIDSWARM_DEBUG, false),
  signing: process.env.DROIDSWARM_FEDERATION_SIGNING_KEY_ID
    ? {
      keyId: process.env.DROIDSWARM_FEDERATION_SIGNING_KEY_ID,
      privateKeyPem: process.env.DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY,
      publicKeyPem: process.env.DROIDSWARM_FEDERATION_SIGNING_PUBLIC_KEY,
      trustedPublicKeys: process.env.DROIDSWARM_FEDERATION_TRUSTED_PUBLIC_KEYS
        ? JSON.parse(process.env.DROIDSWARM_FEDERATION_TRUSTED_PUBLIC_KEYS)
        : undefined,
      enforceVerification: toBooleanFlag(process.env.DROIDSWARM_FEDERATION_ENFORCE_SIGNATURES, false),
    }
    : undefined,
});

if (require.main === module) {
  startFromEnvironment();
}
