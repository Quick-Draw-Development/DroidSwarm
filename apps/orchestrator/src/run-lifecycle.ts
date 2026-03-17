import { randomUUID } from 'node:crypto';

import type { PersistenceClient } from './persistence/repositories';
import type {
  RunRecord,
  PersistedTask,
  TaskAttemptRecord,
} from './types';

const nowIso = (): string => new Date().toISOString();
const terminalRunStatuses: RunRecord['status'][] = ['completed', 'failed', 'cancelled'];
const terminalTaskStatuses: PersistedTask['status'][] = ['completed', 'verified', 'failed', 'cancelled'];
const runningAttemptStatus: TaskAttemptRecord['status'] = 'running';

export class RunLifecycleService {
  constructor(private readonly persistence: PersistenceClient) {}

  recoverInterruptedRuns(): void {
    const activeRuns = this.persistence.runs.listActiveRuns();
    for (const run of activeRuns) {
      const reason = 'unexpected orchestrator restart';
      this.persistence.runs.updateStatus(run.runId, 'failed', { reason });
      this.persistence.recordRunEvent(run.runId, 'run_recovered', 'Run recovered after restart', { reason });
      this.markRunningAttemptsFailed(run.runId, reason);
      this.failPendingTasks(run.runId, reason);
    }
  }

  startRun(run: RunRecord): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'running');
    this.persistence.recordRunEvent(run.runId, 'run_started', 'Run started');
  }

  completeRun(run: RunRecord, detail = 'Run completed'): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'completed');
    this.persistence.recordRunEvent(run.runId, 'run_completed', detail);
  }

  failRun(run: RunRecord, detail: string): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'failed');
    this.persistence.recordRunEvent(run.runId, 'run_failed', detail);
  }

  cancelRun(run: RunRecord, detail = 'Run cancelled'): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'cancelled');
    this.persistence.recordRunEvent(run.runId, 'run_cancelled', detail);
  }

  private markRunningAttemptsFailed(runId: string, reason: string): void {
    const rows = this.persistence.database
      .prepare('SELECT attempt_id FROM task_attempts WHERE run_id = ? AND status = ?')
      .all(runId, runningAttemptStatus) as Array<{ attempt_id: string }>;
    for (const row of rows) {
      this.persistence.attempts.updateStatus(row.attempt_id, 'failed', { reason });
    }
  }

  private failPendingTasks(runId: string, reason: string): void {
    const tasks = this.persistence.tasks.listByRun(runId);
    for (const task of tasks) {
      if (terminalTaskStatuses.includes(task.status)) {
        continue;
      }
      this.persistence.tasks.create({
        ...task,
        status: 'failed',
        metadata: {
          ...(task.metadata ?? {}),
          recovery_reason: reason,
        },
        updatedAt: nowIso(),
      });
    }
  }

  cancelRunById(runId: string, detail?: string): void {
    const run = this.persistence.runs.get(runId);
    if (!run) {
      return;
    }
    this.cancelRun(run, detail);
  }

  failRunById(runId: string, detail: string): void {
    const run = this.persistence.runs.get(runId);
    if (!run) {
      return;
    }
    this.failRun(run, detail);
  }

  completeRunById(runId: string, detail?: string): void {
    const run = this.persistence.runs.get(runId);
    if (!run) {
      return;
    }
    this.completeRun(run, detail);
  }
}
