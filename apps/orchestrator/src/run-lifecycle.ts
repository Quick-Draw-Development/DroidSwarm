import type { PersistenceClient } from './persistence/repositories';
import type {
  RunRecord,
  PersistedTask,
  TaskAttemptRecord,
} from './types';

const nowIso = (): string => new Date().toISOString();
export const terminalRunStatuses: RunRecord['status'][] = ['completed', 'failed', 'cancelled'];
export const terminalTaskStatuses: PersistedTask['status'][] = ['completed', 'verified', 'failed', 'cancelled'];
const interruptedAttemptStatuses: TaskAttemptRecord['status'][] = ['running', 'blocked'];

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
    this.markInterruptedAttemptsFailed(run.runId, reason);
    const tasks = this.persistence.tasks.listByRun(run.runId);
    const resumedTasks: string[] = [];
    const failedTasks: Array<{ taskId: string; reason: string }> = [];

    for (const task of tasks) {
      if (terminalTaskStatuses.includes(task.status)) {
        continue;
      }

      const latestDigest = this.persistence.digests.getLatestForTask(task.taskId);
      const latestHandoff = this.persistence.handoffs.getLatest(task.taskId, run.runId);

      if (this.shouldResumeTask(task)) {
        resumedTasks.push(task.taskId);
        this.persistence.tasks.create({
          ...task,
          status: 'queued',
          metadata: {
            ...(task.metadata ?? {}),
            recovery_reason: 'requeued_after_restart',
            recovery_previous_status: task.status,
            recovery_digest_id: latestDigest?.id,
            recovery_digest_hash: latestDigest?.federationHash,
            recovery_handoff_id: latestHandoff?.id,
            recovery_handoff_hash: latestHandoff?.federationHash,
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
      'running',
      'waiting_on_dependency',
      'waiting_on_human',
      'in_review',
    ];

    return resumableStatuses.includes(task.status);
  }

  private markInterruptedAttemptsFailed(runId: string, reason: string): void {
    for (const status of interruptedAttemptStatuses) {
      const rows = this.persistence.database
        .prepare('SELECT attempt_id FROM task_attempts WHERE run_id = ? AND status = ?')
        .all(runId, status) as Array<{ attempt_id: string }>;
      for (const row of rows) {
        this.persistence.attempts.updateStatus(row.attempt_id, 'failed', {
          reason,
          recovery_interrupted_status: status,
        });
      }
    }
  }
}
