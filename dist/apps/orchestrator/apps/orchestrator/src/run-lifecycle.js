var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var run_lifecycle_exports = {};
__export(run_lifecycle_exports, {
  RunLifecycleService: () => RunLifecycleService
});
module.exports = __toCommonJS(run_lifecycle_exports);
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const terminalRunStatuses = ["completed", "failed", "cancelled"];
const terminalTaskStatuses = ["completed", "verified", "failed", "cancelled"];
const runningAttemptStatus = "running";
class RunLifecycleService {
  constructor(persistence) {
    this.persistence = persistence;
    this.lastRecoverySummaries = [];
  }
  recoverInterruptedRuns() {
    const activeRuns = this.persistence.runs.listActiveRuns();
    const summaries = [];
    for (const run of activeRuns) {
      summaries.push(this.recoverRun(run));
    }
    this.lastRecoverySummaries = summaries;
    return summaries;
  }
  getRecoverySummaries() {
    return this.lastRecoverySummaries;
  }
  startRun(run) {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, "running");
    this.persistence.recordExecutionEvent(run.runId, "run_started", "Run started");
  }
  completeRun(run, detail = "Run completed") {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, "completed");
    this.persistence.recordExecutionEvent(run.runId, "run_completed", detail);
  }
  failRun(run, detail) {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, "failed");
    this.persistence.recordExecutionEvent(run.runId, "run_failed", detail);
  }
  cancelRun(run, detail = "Run cancelled") {
    if (terminalRunStatuses.includes(run.status)) {
      return;
    }
    this.persistence.runs.updateStatus(run.runId, "cancelled");
    this.persistence.recordExecutionEvent(run.runId, "run_cancelled", detail);
  }
  cancelRunById(runId, detail) {
    const run = this.persistence.runs.get(runId);
    if (!run) {
      return;
    }
    this.cancelRun(run, detail);
  }
  failRunById(runId, detail) {
    const run = this.persistence.runs.get(runId);
    if (!run) {
      return;
    }
    this.failRun(run, detail);
  }
  completeRunById(runId, detail) {
    const run = this.persistence.runs.get(runId);
    if (!run) {
      return;
    }
    this.completeRun(run, detail);
  }
  recoverRun(run) {
    const reason = "unexpected orchestrator restart";
    this.markRunningAttemptsFailed(run.runId, reason);
    const tasks = this.persistence.tasks.listByRun(run.runId);
    const resumedTasks = [];
    const failedTasks = [];
    for (const task of tasks) {
      if (terminalTaskStatuses.includes(task.status)) {
        continue;
      }
      if (this.shouldResumeTask(task)) {
        resumedTasks.push(task.taskId);
        this.persistence.tasks.create({
          ...task,
          status: "queued",
          metadata: {
            ...task.metadata ?? {},
            recovery_reason: "requeued_after_restart"
          },
          updatedAt: nowIso()
        });
        continue;
      }
      const failureReason = `Task ${task.taskId} in status ${task.status} cannot resume after restart`;
      failedTasks.push({ taskId: task.taskId, reason: failureReason });
      this.persistence.tasks.create({
        ...task,
        status: "failed",
        metadata: {
          ...task.metadata ?? {},
          recovery_reason: failureReason
        },
        updatedAt: nowIso()
      });
    }
    if (resumedTasks.length > 0) {
      this.persistence.runs.updateStatus(run.runId, "running");
      this.persistence.recordExecutionEvent(run.runId, "run_recovered", "Run recovered after restart", {
        reason,
        resumedTasks: resumedTasks.length
      });
    } else {
      const detail = failedTasks.length > 0 ? failedTasks[0].reason : "No resumable work after restart";
      this.persistence.recordExecutionEvent(run.runId, "run_recovered", "Run recovery failed", {
        reason: detail
      });
      this.failRun(run, detail);
    }
    return { runId: run.runId, resumedTasks, failedTasks };
  }
  shouldResumeTask(task) {
    const resumableStatuses = [
      "queued",
      "planning",
      "waiting_on_dependency",
      "waiting_on_human"
    ];
    if (resumableStatuses.includes(task.status)) {
      return true;
    }
    if (task.status === "running") {
      return this.hasCheckpoint(task.taskId);
    }
    return false;
  }
  hasCheckpoint(taskId) {
    const row = this.persistence.database.prepare("SELECT 1 FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(taskId);
    return Boolean(row);
  }
  markRunningAttemptsFailed(runId, reason) {
    const rows = this.persistence.database.prepare("SELECT attempt_id FROM task_attempts WHERE run_id = ? AND status = ?").all(runId, runningAttemptStatus);
    for (const row of rows) {
      this.persistence.attempts.updateStatus(row.attempt_id, "failed", { reason });
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RunLifecycleService
});
