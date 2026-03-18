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
var run_shutdown_exports = {};
__export(run_shutdown_exports, {
  finalizeRunOnShutdown: () => finalizeRunOnShutdown
});
module.exports = __toCommonJS(run_shutdown_exports);
var import_run_lifecycle = require("./run-lifecycle");
const finalizeRunOnShutdown = (persistence, runLifecycle, runId) => {
  const run = persistence.runs.get(runId);
  if (!run) {
    return "noop";
  }
  if (import_run_lifecycle.terminalRunStatuses.includes(run.status)) {
    return "noop";
  }
  const tasks = persistence.tasks.listByRun(runId);
  const hasActiveTask = tasks.some((task) => !import_run_lifecycle.terminalTaskStatuses.includes(task.status));
  if (hasActiveTask) {
    persistence.recordExecutionEvent(runId, "run_interrupted", "Orchestrator shutdown interrupted run", {
      pending_tasks: tasks.filter((task) => !import_run_lifecycle.terminalTaskStatuses.includes(task.status)).map((task) => task.taskId)
    });
    return "interrupted";
  }
  runLifecycle.completeRun(run, "Run completed at shutdown");
  return "completed";
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  finalizeRunOnShutdown
});
