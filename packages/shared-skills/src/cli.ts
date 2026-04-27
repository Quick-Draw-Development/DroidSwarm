import {
  approveRegisteredSkill,
  buildSkill,
  createSkillScaffold,
  listRegisteredSkillManifests,
  resolveSkillsRoot,
} from './skill-registry';
import {
  approveSpecializedAgent,
  createAgentManifest,
  listSpecializedAgents,
  syncDiscoveredAgents,
} from './agent-builder';
import { runCodeReview } from './code-review';

const command = process.argv[2];
const args = process.argv.slice(3);

const readValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
};

const output = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

switch (command) {
  case 'list':
    output(listRegisteredSkillManifests());
    break;
  case 'create': {
    const name = readValue('--name');
    if (!name) {
      throw new Error('Missing --name');
    }
    output(createSkillScaffold({
      rootDir: resolveSkillsRoot(),
      name,
      template: (readValue('--template') as 'basic' | 'research' | 'code' | 'review' | 'custom' | undefined) ?? 'basic',
    }));
    break;
  }
  case 'build': {
    const name = readValue('--name');
    if (!name) {
      throw new Error('Missing --name');
    }
    output(buildSkill(name));
    break;
  }
  case 'approve-skill': {
    const name = readValue('--name');
    if (!name) {
      throw new Error('Missing --name');
    }
    output(approveRegisteredSkill(name));
    break;
  }
  case 'agents':
    output(listSpecializedAgents());
    break;
  case 'agent-create': {
    const name = readValue('--name');
    const skills = (readValue('--skills') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!name || skills.length === 0) {
      throw new Error('Missing --name or --skills');
    }
    output(createAgentManifest({
      skillsRoot: resolveSkillsRoot(),
      name,
      skills,
      priority: (readValue('--priority') as 'low' | 'medium' | 'high' | undefined) ?? 'medium',
      preferredBackend: readValue('--preferred-backend'),
      modelTier: readValue('--model-tier'),
    }));
    syncDiscoveredAgents(resolveSkillsRoot());
    break;
  }
  case 'approve-agent': {
    const name = readValue('--name');
    if (!name) {
      throw new Error('Missing --name');
    }
    output(approveSpecializedAgent(name));
    break;
  }
  case 'review-run': {
    const prId = readValue('--pr-id');
    if (!prId) {
      throw new Error('Missing --pr-id');
    }
    output(runCodeReview({
      prId,
      project: readValue('--project'),
      repoRoot: readValue('--repo-root'),
      prBody: readValue('--body'),
    }));
    break;
  }
  default:
    throw new Error(`Unknown shared-skills cli command: ${command ?? '(missing)'}`);
}
