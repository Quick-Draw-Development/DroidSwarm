import type { WorkerResult } from '@shared-types';
import { normalizeLegacyCodexResult, type LegacyCodexAgentResult } from '@shared-workers';

export const normalizeResult = (value: WorkerResult | LegacyCodexAgentResult | Record<string, unknown>): WorkerResult | Record<string, unknown> => {
  if (typeof value === 'object' && value !== null && typeof (value as LegacyCodexAgentResult).status === 'string') {
    return normalizeLegacyCodexResult(value as LegacyCodexAgentResult) as WorkerResult;
  }
  return value as WorkerResult | Record<string, unknown>;
};
