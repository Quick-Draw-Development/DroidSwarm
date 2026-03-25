import { composePlugins, withNx } from '@nx/next';

const nextConfig = {
  nx: {},
  output: 'standalone',
  distDir: '../../dist/apps/dashboard/.next',
  serverExternalPackages: ['better-sqlite3'],
};

export default composePlugins(withNx)(nextConfig);
