import { normalizeLegacyCodexResult, type LegacyCodexAgentResult } from '@shared-workers';
import type { WorkerEngine, WorkerResult } from '../types';

const isLegacyCodexResult = (value: unknown): value is LegacyCodexAgentResult => {
  return typeof value === 'object' && value !== null && typeof (value as LegacyCodexAgentResult).status === 'string';
};

export class WorkerResultService {
  normalize(payload: unknown, engine: WorkerEngine = 'codex-cloud', model?: string): WorkerResult {
    if (isLegacyCodexResult(payload)) {
      return normalizeLegacyCodexResult(payload, engine, model);
    }
    return payload as WorkerResult;
  }
}
