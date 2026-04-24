import {
  approveLawProposal,
  listActiveLaws,
  listLawProposals,
  rejectLawProposal,
  runGovernanceDebate,
  validateCompliance,
} from './index';

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
    output(listActiveLaws().map((law) => ({
      id: law.id,
      version: law.version,
      title: law.title,
      description: law.description,
      glyph: law.glyph,
    })));
    break;
  case 'status':
    output(validateCompliance({
      eventType: 'governance.status',
      actorRole: 'cli',
      swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
      projectId: process.env.DROIDSWARM_PROJECT_ID,
      auditLoggingEnabled: true,
      dashboardEnabled: false,
    }));
    break;
  case 'proposals':
    output(listLawProposals());
    break;
  case 'propose': {
    const title = readValue('--title');
    const description = readValue('--description');
    const rationale = readValue('--rationale') ?? description;
    if (!title || !description || !rationale) {
      throw new Error('Missing --title, --description, or --rationale');
    }
    output(runGovernanceDebate({
      lawId: `LAW-${String(listLawProposals().length + 6).padStart(3, '0')}`,
      title,
      description,
      rationale,
      glyph: 'EVT-LAW-PROPOSAL',
      proposedBy: process.env.USER ?? 'cli',
      context: {
        eventType: 'governance.proposal',
        actorRole: 'planner',
        swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
        projectId: process.env.DROIDSWARM_PROJECT_ID,
        auditLoggingEnabled: true,
        dashboardEnabled: false,
        droidspeakState: { compact: 'EVT-LAW-PROPOSAL', expanded: description, kind: 'memory_pinned' },
      },
    }));
    break;
  }
  case 'approve': {
    const proposalId = readValue('--proposal-id');
    if (!proposalId) {
      throw new Error('Missing --proposal-id');
    }
    output(approveLawProposal(proposalId, {
      approvedBy: process.env.USER ?? 'cli',
      comment: readValue('--comment'),
    }));
    break;
  }
  case 'reject': {
    const proposalId = readValue('--proposal-id');
    if (!proposalId) {
      throw new Error('Missing --proposal-id');
    }
    output(rejectLawProposal(proposalId, {
      rejectedBy: process.env.USER ?? 'cli',
      comment: readValue('--comment'),
    }));
    break;
  }
  default:
    throw new Error(`Unknown shared-governance cli command: ${command ?? '(missing)'}`);
}
