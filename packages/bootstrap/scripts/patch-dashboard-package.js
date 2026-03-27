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
