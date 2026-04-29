export type ModelBackend = 'apple-intelligence' | 'mlx' | 'local-llama' | 'openmythos';

import { chooseBestModel, listRegisteredModels, type ModelPreferenceProfile } from '@shared-models';
import type { RegisteredModelRecord } from '@shared-projects';

export interface ModelRouterContext {
  platform?: string;
  arch?: string;
  taskType?: string;
  stage?: string;
  summary?: string;
  contextLength?: number;
  iterationCountExpected?: number;
  selfCorrectionNeeded?: boolean;
  longHorizon?: boolean;
  polishingPhase?: boolean;
  failureRecoveryMode?: boolean;
  preferAppleIntelligence?: boolean;
  appleRuntimeAvailable?: boolean;
  mlxAvailable?: boolean;
  mythosAvailable?: boolean;
  preferMlx?: boolean;
}

export interface ModelRouteDecision {
  backend: ModelBackend;
  reason: string;
  prefersAppleSilicon: boolean;
  appleRuntimeAvailable: boolean;
  mlxAvailable: boolean;
  mythosAvailable: boolean;
  preferRalphWorker: boolean;
}

export interface RoleModelSelectionInput extends ModelRouterContext {
  role?: string;
  useCase?: string;
  requirements?: ModelPreferenceProfile;
  inventory?: RegisteredModelRecord[];
}

export interface RoleModelSelectionDecision extends ModelRouteDecision {
  model?: RegisteredModelRecord;
}

const heavyTaskHints = ['vision', 'embedding', 'analysis', 'summary', 'checkpoint', 'compress'];
const mythosTaskHints = ['deep', 'recurrent', 'long-horizon', 'code-review', 'review', 'governance', 'evolution', 'mythos'];
const ralphTaskHints = ['long-horizon', 'polish', 'polishing', 'refine', 'refinement', 'iterative', 'synthesis', 'recovery'];

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

const inferMythosContext = (context: ModelRouterContext): boolean => {
  const combined = `${context.taskType ?? ''} ${context.stage ?? ''} ${context.summary ?? ''}`.toLowerCase();
  const contextLength = context.contextLength ?? 0;
  return contextLength >= 20_000 || mythosTaskHints.some((hint) => combined.includes(hint));
};

const inferRalphContext = (context: ModelRouterContext): boolean => {
  const combined = `${context.taskType ?? ''} ${context.stage ?? ''} ${context.summary ?? ''}`.toLowerCase();
  return (context.iterationCountExpected ?? 0) > 8
    || context.selfCorrectionNeeded === true
    || context.longHorizon === true
    || context.polishingPhase === true
    || context.failureRecoveryMode === true
    || ralphTaskHints.some((hint) => combined.includes(hint));
};

export const chooseBackendDecision = (context: ModelRouterContext = {}): ModelRouteDecision => {
  const prefersAppleSilicon = context.preferAppleIntelligence ?? detectAppleSilicon(context.platform, context.arch);
  const appleRuntimeAvailable = context.appleRuntimeAvailable !== false;
  const mlxAvailable = context.mlxAvailable === true;
  const mythosAvailable = context.mythosAvailable === true;
  const ralphAvailable = ['1', 'true', 'yes', 'on'].includes((process.env.DROIDSWARM_ENABLE_RALPH ?? '').toLowerCase());
  const heavyLocalContext = inferHeavyLocalContext(context);
  const mythosContext = inferMythosContext(context);
  const preferRalphWorker = ralphAvailable && inferRalphContext(context);
  const preferMlx = context.preferMlx === true || (heavyLocalContext && mlxAvailable);

  if (mythosAvailable && mythosContext) {
    return {
      backend: 'openmythos',
      reason: 'Deep recurrent reasoning detected; preferring OpenMythos for multi-step local cognition.',
      prefersAppleSilicon,
      appleRuntimeAvailable,
      mlxAvailable,
      mythosAvailable,
      preferRalphWorker,
    };
  }

  if (prefersAppleSilicon && appleRuntimeAvailable) {
    return {
      backend: 'apple-intelligence',
      reason: 'Apple Silicon host detected; preferring Foundation Models with structured local execution.',
      prefersAppleSilicon,
      appleRuntimeAvailable,
      mlxAvailable,
      mythosAvailable,
      preferRalphWorker,
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
      mythosAvailable,
      preferRalphWorker,
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
    mythosAvailable,
    preferRalphWorker,
  };
};

export const chooseBackend = (context: ModelRouterContext = {}): ModelBackend =>
  chooseBackendDecision(context).backend;

const roleProfileDefaults = (role: string, useCase?: string): ModelPreferenceProfile => {
  const normalized = `${role} ${useCase ?? ''}`.toLowerCase();
  if (normalized.includes('review')) {
    return { reasoningDepth: 'high', minContextLength: 16_000, toolUse: true, role, useCase, tags: ['review', 'code'] };
  }
  if (normalized.includes('plan') || normalized.includes('research')) {
    return { reasoningDepth: 'high', minContextLength: 12_000, speedPriority: 'balanced', role, useCase };
  }
  if (normalized.includes('verif') || normalized.includes('guardian')) {
    return { reasoningDepth: 'medium', speedPriority: 'latency', role, useCase };
  }
  if (normalized.includes('code') || normalized.includes('coder') || normalized.includes('dev')) {
    return { reasoningDepth: 'high', toolUse: true, minContextLength: 12_000, role, useCase, tags: ['code'] };
  }
  return { reasoningDepth: 'medium', speedPriority: 'balanced', role, useCase };
};

export const loadModelInventory = (nodeId?: string): RegisteredModelRecord[] =>
  (() => {
    try {
      return listRegisteredModels({ ...(nodeId ? { nodeId } : {}), enabledOnly: true });
    } catch {
      return [];
    }
  })();

export const selectModelForRole = (input: RoleModelSelectionInput = {}): RoleModelSelectionDecision => {
  const backendDecision = chooseBackendDecision(input);
  const inventory = input.inventory ?? loadModelInventory();
  const role = input.role ?? input.taskType ?? 'general';
  const requirements = {
    ...roleProfileDefaults(role, input.useCase),
    ...input.requirements,
  };

  const preferredBackend = backendDecision.backend;
  const preferredModel = chooseBestModel(
    inventory.filter((entry) => entry.backend === preferredBackend),
    { ...requirements, backend: preferredBackend },
  );
  if (preferredModel) {
    return {
      ...backendDecision,
      model: preferredModel,
    };
  }

  const fallbackModel = chooseBestModel(inventory, requirements);
  return {
    ...backendDecision,
    reason: fallbackModel
      ? `${backendDecision.reason} Selected best available fallback model from the shared inventory.`
      : backendDecision.reason,
    ...(fallbackModel ? { model: fallbackModel, backend: fallbackModel.backend } : {}),
  };
};
