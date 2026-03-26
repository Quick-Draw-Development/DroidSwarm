import { composePlugins, withNx } from '@nx/next';

const excludedProjectFiles = ['project.json', '**/project.json'];

const nextConfig = {
  nx: {},
  output: 'standalone',
  distDir: '../../dist/apps/dashboard/.next',
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingExcludes: {
    'next-server': excludedProjectFiles,
    'next-minimal-server': excludedProjectFiles,
  },
};

export default composePlugins(withNx)(nextConfig);
