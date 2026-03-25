import ModuleConstructor, { Module } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

(function patchProtocolAlias() {
  const FLAG = Symbol.for('droidswarm.protocolAliasPatched');
  const moduleWithFlag = ModuleConstructor as unknown as Record<symbol, boolean>;
  if (moduleWithFlag[FLAG]) {
    return;
  }
  moduleWithFlag[FLAG] = true;

  const aliasDir = resolve(__dirname, '../../protocol/src');
  const protocolRoots = [
    resolve(process.cwd(), 'dist/packages/protocol/src'),
    resolve(process.cwd(), 'packages/protocol/src'),
    aliasDir,
  ];
  const protocolRoot = protocolRoots.find((root) => existsSync(root));
  if (!protocolRoot) {
    return;
  }

  const moduleWithResolver = ModuleConstructor as unknown as {
    _resolveFilename: (request: string, parent: Module | null, ...rest: unknown[]) => string;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;

  moduleWithResolver._resolveFilename = function (request, parent, ...rest) {
    if (request === '@protocol' || request.startsWith('@protocol/')) {
      const subpath = request === '@protocol' ? 'index' : request.slice('@protocol/'.length);
      const candidate = resolveCandidate(protocolRoot, subpath);
      if (candidate) {
        return originalResolveFilename.call(this, candidate, parent, ...rest);
      }
    }
    // eslint-disable-next-line prefer-rest-params
    return originalResolveFilename.apply(this, arguments as unknown as Parameters<typeof originalResolveFilename>);
  };
})();

function resolveCandidate(root: string, subpath: string): string | undefined {
  const candidates = new Set<string>();
  candidates.add(subpath);
  if (!subpath.endsWith('.js')) {
    candidates.add(`${subpath}.js`);
  }
  if (!subpath.endsWith('.ts')) {
    candidates.add(`${subpath}.ts`);
  }

  for (const candidate of candidates) {
    const resolved = join(root, candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return undefined;
}
