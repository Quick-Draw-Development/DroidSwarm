import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createSkillScaffold, buildSkill, syncDiscoveredSkills } from './skill-registry';
import { createAgentManifest, buildSpecializedAgent, syncDiscoveredAgents } from './agent-builder';

test('creates, discovers, and builds skill scaffolds', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-shared-skills-'));
  const skillsRoot = path.join(home, 'skills');
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_SKILLS_DIR = skillsRoot;

  const manifest = createSkillScaffold({
    rootDir: skillsRoot,
    name: 'vision-agent',
    template: 'research',
  });
  assert.equal(manifest.name, 'vision-agent');

  const records = syncDiscoveredSkills(skillsRoot);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.name, 'vision-agent');

  const built = buildSkill('vision-agent', skillsRoot);
  assert.equal(built.manifest.name, 'vision-agent');
});

test('creates and resolves specialized agents from registered skills', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-shared-agents-'));
  const skillsRoot = path.join(home, 'skills');
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_SKILLS_DIR = skillsRoot;

  createSkillScaffold({
    rootDir: skillsRoot,
    name: 'math-skill',
    template: 'code',
  });
  syncDiscoveredSkills(skillsRoot);

  createAgentManifest({
    skillsRoot,
    name: 'math-agent',
    skills: ['math-skill'],
  });
  syncDiscoveredAgents(skillsRoot);

  const agent = buildSpecializedAgent('math-agent');
  assert.equal(agent?.skills[0], 'math-skill');
});
