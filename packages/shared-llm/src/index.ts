import type { WorkerResult } from '@shared-types';

export interface LocalLlamaRequest {
  prompt: string;
  model: string;
}

export interface LocalLlamaClient {
  run(request: LocalLlamaRequest): Promise<WorkerResult>;
}
