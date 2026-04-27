import {
  discoverModels,
  downloadDiscoveredModel,
  listDiscoveredModels,
  listRegisteredModels,
  loadModelDiscoveryConfig,
  refreshModelInventory,
  saveModelDiscoveryConfig,
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

const main = async (): Promise<void> => {
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
      output(
        args.includes('--new')
          ? listDiscoveredModels({
            nodeId: readValue('--node-id'),
            newOnly: true,
          })
          : listRegisteredModels({
            nodeId: readValue('--node-id'),
            backend: readValue('--backend') as 'apple-intelligence' | 'mlx' | 'local-llama' | undefined,
            enabledOnly: !args.includes('--all'),
          }),
      );
      break;
    case 'new':
      output(listDiscoveredModels({
        nodeId: readValue('--node-id'),
        newOnly: true,
      }));
      break;
    case 'discover':
      output(await discoverModels({
        projectId: readValue('--project-id'),
        force: true,
        triggeredBy: 'cli',
      }));
      break;
    case 'download': {
      const modelId = readValue('--model-id') ?? args[0];
      if (!modelId) {
        throw new Error('Missing model id.');
      }
      output(await downloadDiscoveredModel(modelId, {
        triggeredBy: 'cli',
      }));
      break;
    }
    case 'config': {
      const projectId = readValue('--project-id');
      if (args.includes('--set')) {
        const updated = saveModelDiscoveryConfig({
          ...(readValue('--enabled') ? { enabled: readValue('--enabled') === 'true' } : {}),
          ...(readValue('--trusted-authors')
            ? { trustedAuthors: readValue('--trusted-authors')?.split(',').map((entry) => entry.trim()).filter(Boolean) }
            : {}),
          ...(readValue('--blocked-authors')
            ? { blockedAuthors: readValue('--blocked-authors')?.split(',').map((entry) => entry.trim()).filter(Boolean) }
            : {}),
          ...(readValue('--auto-download-small')
            ? { autoDownloadSmallModels: readValue('--auto-download-small') === 'true' }
            : {}),
        }, projectId ? { projectId } : undefined);
        output(updated);
      } else {
        output(loadModelDiscoveryConfig(projectId));
      }
      break;
    }
    default:
      throw new Error(`Unknown shared-models cli command: ${command ?? '(missing)'}`);
  }
};

void main();
