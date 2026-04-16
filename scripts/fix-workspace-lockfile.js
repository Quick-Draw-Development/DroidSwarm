#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const lockPath = path.resolve(__dirname, '..', 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.warn(`Lockfile not found: ${lockPath}`);
  process.exit(0);
}

const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const ensureDeps = (obj, name) => {
  if (!obj) {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(obj, 'dependencies')) {
    obj.dependencies = {};
  }
  if (!obj.name) {
    obj.name = name;
  }
};

const candidates = ['node_modules/protocol', 'node_modules/protocol-alias', 'packages/protocol', 'packages/protocol-alias'];

for (const key of candidates) {
  const entry = lockData.packages && lockData.packages[key];
  const pkgName = key.split('/').pop();
  ensureDeps(entry, pkgName);
}

fs.writeFileSync(lockPath, `${JSON.stringify(lockData, null, 2)}\n`);
console.log('Fixed workspace lockfile entries for protocol packages');
