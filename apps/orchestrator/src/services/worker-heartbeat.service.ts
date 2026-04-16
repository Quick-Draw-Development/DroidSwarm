import { createHeartbeat } from '@shared-workers';
import type { WorkerEngine, WorkerHeartbeat } from '../types';

export class WorkerHeartbeatService {
  build(input: {
    runId: string;
    taskId: string;
    attemptId: string;
    engine: WorkerEngine;
    startedAt: number;
    status: WorkerHeartbeat['status'];
    lastActivity?: string;
  }): WorkerHeartbeat {
    return createHeartbeat({
      runId: input.runId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      engine: input.engine,
      elapsedMs: Math.max(0, Date.now() - input.startedAt),
      status: input.status,
      lastActivity: input.lastActivity,
    });
  }
}
