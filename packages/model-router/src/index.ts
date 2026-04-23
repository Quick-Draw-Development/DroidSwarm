export type ModelBackend = 'apple-intelligence' | 'mlx' | 'local-llama';

export interface ModelRouterContext {
  platform?: string;
  arch?: string;
  taskType?: string;
  stage?: string;
  summary?: string;
  contextLength?: number;
  preferAppleIntelligence?: boolean;
  appleRuntimeAvailable?: boolean;
  mlxAvailable?: boolean;
  preferMlx?: boolean;
}

export interface ModelRouteDecision {
  backend: ModelBackend;
  reason: string;
  prefersAppleSilicon: boolean;
  appleRuntimeAvailable: boolean;
  mlxAvailable: boolean;
}

const heavyTaskHints = ['vision', 'embedding', 'analysis', 'summary', 'checkpoint', 'compress'];

export const detectAppleSilicon = (platform: string = process.platform, arch: string = process.arch): boolean =>
  platform === 'darwin' && arch === 'arm64';

export const detectMlxRuntime = (input?: {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
}): boolean =>
  input?.enabled === true
  || typeof input?.baseUrl === 'string' && input.baseUrl.trim().length > 0
  || typeof input?.model === 'string' && input.model.trim().length > 0;

const inferHeavyLocalContext = (context: ModelRouterContext): boolean => {
  const contextLength = context.contextLength ?? 0;
  if (contextLength >= 16_000) {
    return true;
  }

  const combined = `${context.taskType ?? ''} ${context.stage ?? ''} ${context.summary ?? ''}`.toLowerCase();
  return heavyTaskHints.some((hint) => combined.includes(hint));
};

export const chooseBackendDecision = (context: ModelRouterContext = {}): ModelRouteDecision => {
  const prefersAppleSilicon = context.preferAppleIntelligence ?? detectAppleSilicon(context.platform, context.arch);
  const appleRuntimeAvailable = context.appleRuntimeAvailable !== false;
  const mlxAvailable = context.mlxAvailable === true;
  const heavyLocalContext = inferHeavyLocalContext(context);
  const preferMlx = context.preferMlx === true || (heavyLocalContext && mlxAvailable);

  if (prefersAppleSilicon && appleRuntimeAvailable) {
    return {
      backend: 'apple-intelligence',
      reason: 'Apple Silicon host detected; preferring Foundation Models with structured local execution.',
      prefersAppleSilicon,
      appleRuntimeAvailable,
      mlxAvailable,
    };
  }

  if ((prefersAppleSilicon && !appleRuntimeAvailable && mlxAvailable) || (preferMlx && mlxAvailable)) {
    return {
      backend: 'mlx',
      reason: prefersAppleSilicon
        ? 'Apple runtime unavailable; falling back to MLX local inference.'
        : 'Heavy local context detected; preferring MLX over llama.cpp.',
      prefersAppleSilicon,
      appleRuntimeAvailable,
      mlxAvailable,
    };
  }

  return {
    backend: 'local-llama',
    reason: prefersAppleSilicon
      ? 'Apple runtime unavailable and MLX not ready; falling back to llama.cpp.'
      : 'Using llama.cpp as the default local backend.',
    prefersAppleSilicon,
    appleRuntimeAvailable,
    mlxAvailable,
  };
};

export const chooseBackend = (context: ModelRouterContext = {}): ModelBackend =>
  chooseBackendDecision(context).backend;
