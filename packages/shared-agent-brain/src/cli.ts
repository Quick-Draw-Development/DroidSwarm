import {
  ensureAgentBrainLayout,
} from './layout';
import {
  getBrainStatus,
  listBrainMemoryEntries,
  listBrainPromotionCandidates,
  reviewBrainPromotionCandidate,
} from './memory-store';
import { searchBrainMemories } from './memory-search';
import { runBrainDreamCycle } from './auto-dream';

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

const common = () => ({
  projectRoot: readValue('--project-root'),
  global: readValue('--global') === '1' || readValue('--global') === 'true',
  projectId: readValue('--project'),
});

switch (command) {
  case 'ensure':
    output(ensureAgentBrainLayout(common()));
    break;
  case 'status':
    output(getBrainStatus(common()));
    break;
  case 'search': {
    const query = readValue('--query');
    if (!query) {
      throw new Error('Missing --query');
    }
    output(searchBrainMemories({
      ...common(),
      query,
      limit: readValue('--limit') ? Number.parseInt(readValue('--limit')!, 10) : undefined,
    }));
    break;
  }
  case 'list':
    output(listBrainMemoryEntries({
      ...common(),
      layer: readValue('--layer') as 'working' | 'episodic' | 'semantic' | 'personal' | undefined,
      limit: readValue('--limit') ? Number.parseInt(readValue('--limit')!, 10) : undefined,
    }));
    break;
  case 'candidates':
    output(listBrainPromotionCandidates({
      ...common(),
      status: readValue('--status') as 'pending-review' | 'graduated' | 'rejected' | 'reopened' | undefined,
    }));
    break;
  case 'review': {
    const candidateId = readValue('--candidate-id');
    const action = readValue('--action') as 'graduate' | 'reject' | 'reopen' | undefined;
    const rationale = readValue('--rationale');
    const reviewedBy = readValue('--reviewed-by') ?? process.env.USER ?? 'cli';
    if (!candidateId || !action || !rationale) {
      throw new Error('Missing --candidate-id, --action, or --rationale');
    }
    output(reviewBrainPromotionCandidate({
      ...common(),
      candidateId,
      action,
      rationale,
      reviewedBy,
    }));
    break;
  }
  case 'dream':
    output(runBrainDreamCycle(common()));
    break;
  default:
    throw new Error(`Unknown shared-agent-brain cli command: ${command ?? '(missing)'}`);
}
