#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const pkgPath =
  process.argv[2] || path.resolve(__dirname, '../../dist/apps/dashboard/.next/standalone/apps/dashboard/package.json');

if (!fs.existsSync(pkgPath)) {
  throw new Error(`Dashboard standalone package not found: ${pkgPath}`);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.type = 'commonjs';
if (!pkg.main) {
  pkg.main = 'server.js';
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Patched dashboard standalone package: ${pkgPath}`);

const pkgDir = path.dirname(pkgPath);
const appsDir = path.dirname(pkgDir);
const standaloneRoot = path.resolve(appsDir, '..');

const findNextDir = () => {
  let current = standaloneRoot;
  for (let i = 0; i < 4; i += 1) {
    const candidate = path.join(current, '.next');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    current = path.resolve(current, '..');
  }
  return null;
};

const sourceNextDir = findNextDir();
const targetNextDir = path.join(standaloneRoot, 'dist', 'apps', 'dashboard', '.next');

if (sourceNextDir && fs.existsSync(sourceNextDir)) {
  fs.mkdirSync(targetNextDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceNextDir, { withFileTypes: true })) {
    if (entry.name === 'server' || entry.name === 'standalone') {
      continue;
    }

    const srcPath = path.join(sourceNextDir, entry.name);
    const destPath = path.join(targetNextDir, entry.name);

    if (entry.isDirectory()) {
      fs.rmSync(destPath, { recursive: true, force: true });
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`Bundled dashboard .next assets into ${targetNextDir}`);
} else {
  console.warn(`Source .next directory not found near ${standaloneRoot}`);
}
