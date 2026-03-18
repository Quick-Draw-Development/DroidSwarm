import type { PersistenceClient } from './persistence/repositories';
import type {
  RunRecord,
  PersistedTask,
  TaskAttemptRecord,
} from './types';

const nowIso = (): string => new Date().toISOString();
export const terminalRunStatuses: RunRecord['status'][] = ['completed', 'failed', 'cancelled'];
export const terminalTaskStatuses: PersistedTask['status'][] = ['completed', 'verified', 'failed', 'cancelled'];
const runningAttemptStatus: TaskAttemptRecord['status'] = 'running';

export interface RunRecoverySummary {
  runId: string;
  resumedTasks: string[];
  failedTasks: Array<{ taskId: string; reason: string }>;
}

export class RunLifecycleService {
  private lastRecoverySummaries: RunRecoverySummary[] = [];

  constructor(private readonly persistence: PersistenceClient) {}

  recoverInterruptedRuns(): RunRecoverySummary[] {
    const activeRuns = this.persistence.runs.listActiveRuns();
    const summaries: RunRecoverySummary[] = [];
    for (const run of activeRuns) {
      summaries.push(this.recoverRun(run));
    }
    this.lastRecoverySummaries = summaries;
    return summaries;
  }

  getRecoverySummaries(): RunRecoverySummary[] {
    return this.lastRecoverySummaries;
  }

  startRun(run: RunRecord): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'running');
    this.persistence.recordExecutionEvent(run.runId, 'run_started', 'Run started');
  }

  completeRun(run: RunRecord, detail = 'Run completed'): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'completed');
    this.persistence.recordExecutionEvent(run.runId, 'run_completed', detail);
  }

  failRun(run: RunRecord, detail: string): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'failed');
    this.persistence.recordExecutionEvent(run.runId, 'run_failed', detail);
  }

  cancelRun(run: RunRecord, detail = 'Run cancelled'): void {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, 'cancelled');
    this.persistence.recordExecutionEvent(run.runId, 'run_cancelled', detail);
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

  private recoverRun(run: RunRecord): RunRecoverySummary {
    const reason = 'unexpected orchestrator restart';
    this.markRunningAttemptsFailed(run.runId, reason);
    const tasks = this.persistence.tasks.listByRun(run.runId);
    const resumedTasks: string[] = [];
    const failedTasks: Array<{ taskId: string; reason: string }> = [];

    for (const task of tasks) {
      if (terminalTaskStatuses.includes(task.status)) {
        continue;
      }

      if (this.shouldResumeTask(task)) {
        resumedTasks.push(task.taskId);
        this.persistence.tasks.create({
          ...task,
          status: 'queued',
          metadata: {
            ...(task.metadata ?? {}),
            recovery_reason: 'requeued_after_restart',
          },
          updatedAt: nowIso(),
        });
        continue;
      }

      const failureReason = `Task ${task.taskId} in status ${task.status} cannot resume after restart`;
      failedTasks.push({ taskId: task.taskId, reason: failureReason });
      this.persistence.tasks.create({
        ...task,
        status: 'failed',
        metadata: {
          ...(task.metadata ?? {}),
          recovery_reason: failureReason,
        },
        updatedAt: nowIso(),
      });
    }

    if (resumedTasks.length > 0) {
      this.persistence.runs.updateStatus(run.runId, 'running');
      this.persistence.recordExecutionEvent(run.runId, 'run_recovered', 'Run recovered after restart', {
        reason,
        resumedTasks: resumedTasks.length,
      });
    } else {
      const detail = failedTasks.length > 0
        ? failedTasks[0].reason
        : 'No resumable work after restart';
      this.persistence.recordExecutionEvent(run.runId, 'run_recovered', 'Run recovery failed', {
        reason: detail,
      });
      this.failRun(run, detail);
    }

    return { runId: run.runId, resumedTasks, failedTasks };
  }

  private shouldResumeTask(task: PersistedTask): boolean {
    const resumableStatuses: PersistedTask['status'][] = [
      'queued',
      'planning',
      'waiting_on_dependency',
      'waiting_on_human',
    ];

    if (resumableStatuses.includes(task.status)) {
      return true;
    }

    if (task.status === 'running') {
      return this.hasCheckpoint(task.taskId);
    }

    return false;
  }

  private hasCheckpoint(taskId: string): boolean {
    const row = this.persistence.database
      .prepare('SELECT 1 FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(taskId);
    return Boolean(row);
  }

  private markRunningAttemptsFailed(runId: string, reason: string): void {
    const rows = this.persistence.database
      .prepare('SELECT attempt_id FROM task_attempts WHERE run_id = ? AND status = ?')
      .all(runId, runningAttemptStatus) as Array<{ attempt_id: string }>;
    for (const row of rows) {
      this.persistence.attempts.updateStatus(row.attempt_id, 'failed', { reason });
    }
  }
}
