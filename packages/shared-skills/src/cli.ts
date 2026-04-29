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
import { approveEvolutionProposal, getEvolutionStatus, proposeSkillEvolution } from './skill-evolution-loop';
import {
  getRalphWorkerStatus,
  listRalphWorkers,
  pauseRalphWorker,
  resumeRalphWorker,
  runRalphLoop,
  startRalphWorker,
} from './ralph-loop';

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

const main = async (): Promise<void> => {
  switch (command) {
    case 'list':
      output(listRegisteredSkillManifests());
      return;
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
      return;
    }
    case 'build': {
      const name = readValue('--name');
      if (!name) {
        throw new Error('Missing --name');
      }
      output(buildSkill(name));
      return;
    }
    case 'approve-skill': {
      const name = readValue('--name');
      if (!name) {
        throw new Error('Missing --name');
      }
      output(approveRegisteredSkill(name));
      return;
    }
    case 'agents':
      output(listSpecializedAgents());
      return;
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
      return;
    }
    case 'approve-agent': {
      const name = readValue('--name');
      if (!name) {
        throw new Error('Missing --name');
      }
      output(approveSpecializedAgent(name));
      return;
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
      return;
    }
    case 'evolve-status':
      output(getEvolutionStatus(readValue('--project')));
      return;
    case 'evolve-propose':
      output(proposeSkillEvolution({
        projectId: readValue('--project'),
        proposedBy: process.env.USER ?? 'cli',
        targetSkill: readValue('--target-skill'),
      }));
      return;
    case 'evolve-approve': {
      const proposalId = readValue('--proposal-id');
      if (!proposalId) {
        throw new Error('Missing --proposal-id');
      }
      output(approveEvolutionProposal(proposalId));
      return;
    }
    case 'ralph-start': {
      const goal = readValue('--goal');
      const projectId = readValue('--project') ?? process.env.DROIDSWARM_PROJECT_ID;
      if (!goal || !projectId) {
        throw new Error('Missing --goal or --project');
      }
      output(startRalphWorker({
        projectId,
        goal,
        workerName: readValue('--name'),
        loopConfig: {
          ...(readValue('--max-iterations') ? { maxIterations: Number.parseInt(readValue('--max-iterations')!, 10) } : {}),
          ...(readValue('--completion-signal') ? { completionSignal: readValue('--completion-signal')! } : {}),
          ...(readValue('--sleep-ms') ? { sleepMs: Number.parseInt(readValue('--sleep-ms')!, 10) } : {}),
        },
        spawnDetached: readValue('--spawn-detached') === '0' ? false : true,
      }));
      return;
    }
    case 'ralph-status':
      output(readValue('--session-id') ? getRalphWorkerStatus(readValue('--session-id')!) : listRalphWorkers(readValue('--project')));
      return;
    case 'ralph-pause': {
      const sessionId = readValue('--session-id');
      if (!sessionId) {
        throw new Error('Missing --session-id');
      }
      output(pauseRalphWorker(sessionId));
      return;
    }
    case 'ralph-resume': {
      const sessionId = readValue('--session-id');
      if (!sessionId) {
        throw new Error('Missing --session-id');
      }
      output(resumeRalphWorker(sessionId));
      return;
    }
    case 'ralph-run': {
      const sessionId = readValue('--session-id');
      if (!sessionId) {
        throw new Error('Missing --session-id');
      }
      output(await runRalphLoop(sessionId));
      return;
    }
    default:
      throw new Error(`Unknown shared-skills cli command: ${command ?? '(missing)'}`);
  }
};

void main();
