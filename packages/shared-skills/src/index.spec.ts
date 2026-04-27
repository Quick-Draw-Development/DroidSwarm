import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createSkillScaffold, buildSkill, syncDiscoveredSkills } from './skill-registry';
import { createAgentManifest, buildSpecializedAgent, syncDiscoveredAgents } from './agent-builder';
import { runCodeReview } from './code-review';

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

test('runs a structured code review against a git diff', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'droidswarm-code-review-'));
  const repoRoot = path.join(home, 'repo');
  fs.mkdirSync(repoRoot, { recursive: true });
  process.env.DROIDSWARM_HOME = home;
  process.env.DROIDSWARM_PROJECT_ID = 'demo-review';

  execFileSync('git', ['-C', repoRoot, 'init', '-b', 'main']);
  execFileSync('git', ['-C', repoRoot, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', repoRoot, 'config', 'user.name', 'Tester']);
  fs.writeFileSync(path.join(repoRoot, 'service.ts'), 'export const loadUser = async (id: string) => ({ id });\n');
  fs.writeFileSync(path.join(repoRoot, 'service.spec.ts'), 'import test from "node:test";\n');
  execFileSync('git', ['-C', repoRoot, 'add', '.']);
  execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'initial']);

  execFileSync('git', ['-C', repoRoot, 'checkout', '-b', 'feature/review-agent']);
  fs.writeFileSync(
    path.join(repoRoot, 'service.ts'),
    [
      'export const loadUser = async (id: any) => {',
      '  element.innerHTML = userInput;',
      '  if (id == 0) {',
      '    return await fetch(`/users/${id}`);',
      '  }',
      '  return element.innerHTML;',
      '};',
      '',
    ].join('\n'),
  );
  execFileSync('git', ['-C', repoRoot, 'add', 'service.ts']);
  execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'update service']);

  const result = runCodeReview({
    prId: 'HEAD',
    repoRoot,
    prBody: 'Add user loading change.',
  });

  assert.equal(result.prId, 'HEAD');
  assert.ok(result.findings.length > 0);
  assert.ok(result.findingsMarkdown.includes('blocking') || result.findingsMarkdown.includes('important'));
  assert.ok(result.findings.some((entry) => entry.kind === 'pr-description'));
  assert.ok(result.findings.some((entry) => entry.kind === 'security'));
});
