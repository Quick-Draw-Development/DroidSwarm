import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  detectProjectMetadata,
  getCurrentProject,
  listRegisteredProjects,
  migrateLegacyProject,
  onboardProject,
  resolveCurrentProjectFile,
  resolveProjectLookup,
  setCurrentProject,
} from './index';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.DROIDSWARM_HOME;
  delete process.env.DROIDSWARM_REGISTRY_DB_PATH;
  delete process.env.DROIDSWARM_CURRENT_PROJECT_FILE;
});

describe('shared-projects registry', () => {
  it('onboards, lists, resolves, and selects projects', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'droidswarm-project-registry-'));
    tempDirs.push(home);
    process.env.DROIDSWARM_HOME = home;

    const record = onboardProject({
      projectId: 'alpha',
      name: 'Alpha',
      rootPath: path.join(home, 'alpha'),
      gitRemote: 'git@example.com:alpha.git',
      gitCommitHash: 'abc123',
    });

    assert.equal(listRegisteredProjects().length, 1);
    assert.equal(resolveProjectLookup('alpha')?.projectId, 'alpha');
    assert.equal(resolveProjectLookup(record.rootPath)?.projectId, 'alpha');

    setCurrentProject('alpha');
    assert.equal(getCurrentProject()?.projectId, 'alpha');
    assert.equal(resolveProjectLookup()?.projectId, 'alpha');
  });

  it('detects metadata and migrates a legacy project', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'droidswarm-project-migrate-'));
    const repo = path.join(home, 'repo');
    tempDirs.push(home);
    fs.mkdirSync(repo, { recursive: true });
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'demo-app' }, null, 2));
    fs.mkdirSync(path.join(repo, '.droidswarm'), { recursive: true });
    writeFileSync(path.join(repo, '.droidswarm', 'droidswarm.db'), '');

    process.env.DROIDSWARM_HOME = home;

    const metadata = detectProjectMetadata(repo);
    assert.equal(metadata.name, 'demo-app');

    const migrated = migrateLegacyProject(repo);
    assert.equal(migrated.projectId, 'demo-app');
    assert.equal(migrated.dbPath, path.join(repo, '.droidswarm', 'droidswarm.db'));
    assert.equal(listRegisteredProjects()[0]?.projectId, 'demo-app');
  });
});
