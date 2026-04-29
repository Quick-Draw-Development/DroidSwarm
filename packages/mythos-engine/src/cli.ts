import { bootstrapMythosRuntime, inspectMythosRuntime, readMythosRuntimeRegistry, setMythosLoopCount } from './index';

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
    case 'status':
      output({
        current: await inspectMythosRuntime(),
        registry: readMythosRuntimeRegistry(),
      });
      break;
    case 'bootstrap':
      output(await bootstrapMythosRuntime());
      break;
    case 'loops': {
      const engineId = readValue('--engine-id') ?? args[0];
      const loopCountRaw = readValue('--count') ?? args[1];
      if (!engineId || !loopCountRaw) {
        throw new Error('Missing engine id or loop count.');
      }
      output(await setMythosLoopCount(engineId, Number.parseInt(loopCountRaw, 10)));
      break;
    }
    default:
      throw new Error(`Unknown mythos command: ${command ?? '(missing)'}`);
  }
};

void main();
