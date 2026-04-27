import { listRegisteredModels, refreshModelInventory } from './model-inventory';

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
  case 'refresh':
    output(refreshModelInventory({
      nodeId: readValue('--node-id'),
      modelsRoot: readValue('--models-root'),
      cacheFile: readValue('--cache-file'),
      includeVirtualBackends: !args.includes('--no-virtual-backends'),
      persist: !args.includes('--no-persist'),
    }));
    break;
  case 'status':
  case 'list':
    output(listRegisteredModels({
      nodeId: readValue('--node-id'),
      backend: readValue('--backend') as 'apple-intelligence' | 'mlx' | 'local-llama' | undefined,
      enabledOnly: !args.includes('--all'),
    }));
    break;
  default:
    throw new Error(`Unknown shared-models cli command: ${command ?? '(missing)'}`);
}
