import type { PersistenceClient } from './persistence/repositories';
import type { RunRecord } from './types';
import { RunLifecycleService, terminalRunStatuses, terminalTaskStatuses } from './run-lifecycle';

export type ShutdownResult = 'noop' | 'completed' | 'interrupted';

export const finalizeRunOnShutdown = (
  persistence: PersistenceClient,
  runLifecycle: RunLifecycleService,
  runId: string,
): ShutdownResult => {
  const run = persistence.runs.get(runId);
  if (!run) {
    return 'noop';
  }

  if (terminalRunStatuses.includes(run.status)) {
    return 'noop';
  }

  const tasks = persistence.tasks.listByRun(runId);
  const hasActiveTask = tasks.some((task) => !terminalTaskStatuses.includes(task.status));
  if (hasActiveTask) {
    persistence.recordExecutionEvent(runId, 'run_interrupted', 'Orchestrator shutdown interrupted run', {
      pending_tasks: tasks.filter((task) => !terminalTaskStatuses.includes(task.status)).map((task) => task.taskId),
    });
    return 'interrupted';
  }

  runLifecycle.completeRun(run, 'Run completed at shutdown');
  return 'completed';
};
