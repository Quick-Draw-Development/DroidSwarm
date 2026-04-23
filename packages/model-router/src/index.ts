export type ModelBackend = 'apple-intelligence' | 'mlx' | 'local-llama';

export interface ModelRouterContext {
  taskType?: string;
  contextLength?: number;
  preferAppleIntelligence?: boolean;
  appleRuntimeAvailable?: boolean;
  mlxAvailable?: boolean;
}

export const detectAppleSilicon = (platform = process.platform, arch = process.arch): boolean =>
  platform === 'darwin' && arch === 'arm64';

export const chooseBackend = (context: ModelRouterContext = {}): ModelBackend => {
  const preferApple = context.preferAppleIntelligence ?? detectAppleSilicon();
  if (preferApple && context.appleRuntimeAvailable !== false) {
    return 'apple-intelligence';
  }

  const heavyContext = (context.contextLength ?? 0) > 16_000;
  const taskType = context.taskType?.toLowerCase() ?? '';
  const prefersMlx = heavyContext || taskType.includes('vision') || taskType.includes('embedding');
  if (prefersMlx && context.mlxAvailable) {
    return 'mlx';
  }

  return 'local-llama';
};
