import { listLongTermMemories, pruneLongTermMemories } from './memory-store';
import { searchLongTermMemories } from './memory-retrieval';
import { runReflectionCycle } from './reflection-engine';

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
    output(listLongTermMemories({
      projectId: readValue('--project'),
      limit: readValue('--limit') ? Number.parseInt(readValue('--limit') ?? '', 10) : undefined,
    }));
    break;
  case 'search': {
    const query = readValue('--query');
    if (!query) {
      throw new Error('Missing --query');
    }
    output(searchLongTermMemories({
      query,
      projectId: readValue('--project'),
      limit: readValue('--limit') ? Number.parseInt(readValue('--limit') ?? '', 10) : undefined,
    }));
    break;
  }
  case 'reflect':
    output(runReflectionCycle({
      projectId: readValue('--project'),
    }));
    break;
  case 'prune':
    output({
      removed: pruneLongTermMemories({
        olderThanIso: readValue('--older-than'),
        maxPerProject: readValue('--max-per-project')
          ? Number.parseInt(readValue('--max-per-project') ?? '', 10)
          : undefined,
      }),
    });
    break;
  default:
    throw new Error(`Unknown shared-memory cli command: ${command ?? '(missing)'}`);
}
