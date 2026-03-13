import { composePlugins, withNx } from '@nx/next';

const nextConfig = {
  nx: {},
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
};

export default composePlugins(withNx)(nextConfig);
