# Orchestrator Cleanup Plan

This note captures the remaining cleanup work described in the latest ticket:

## Observed gaps

1. **Dual control paths** – `apps/orchestrator/src/worker.ts` still posts artifacts, spawn requests, and status updates over the socket _and_ emits the full `CodexAgentResult` via `process.send`. The orchestrator uses the IPC message to drive `TaskScheduler.handleAgentResult`, creating a split-brain flow where durable execution events are recorded but decisions still depend on transient IPC.
2. **Shutdown semantics** – `OrchestratorClient.stop()` unconditionally calls `RunLifecycleService.completeRunById`, so a run that has already failed/cancelled or that is interrupted during shutdown is overwritten as `completed`.
3. **Dashboard detail placeholders** – `apps/dashboard/src/lib/db.ts` still fabricates handoffs/guardrails text instead of reading persisted data (operator actions, budget events, dependencies, etc.).
4. **Readme mismatch** – `README.md` lists dashboard and socket-server but omits apps/orchestrator, and some wording still calls the orchestration flow a “scaffold” even though it is now featured with durability guarantees.

## Cleanup steps

1. **Phase 1**: Route all agent results through persisted execution events. Update the worker to stop sending `process.send`, enrich the final `status_update` payload with the `CodexAgentResult`, and have `OrchestratorEngine` parse that event to invoke the scheduler. Keep artifact/spawn/clarification messages so their executed events continue to exist for the dashboard, but make scheduler decisions rely on the recorded events rather than IPC.
2. **Phase 2**: Adjust `OrchestratorClient.stop()` to inspect the run’s terminal status before finalizing. Only call `completeRunById` for runs that remain `running` or `queued`; otherwise preserve existing `failed/cancelled/completed` states or mark interrupted runs as failed with an explanation. Add regression tests per scenario.
3. **Phase 3**: Remove synthetic strings from dashboard detail mapping. Surface real data from `execution_events`, `operator_actions`, `timer` tables, and the rest of the persistence schema; hide or label unavailable sections when there is no durable source yet.
4. **Phase 4**: Update `README.md`’s workspace layout and wording to reflect the orchestrator app’s central control-plane role and the now production-ready pipeline; keep documentation links accurate.
5. **Phase 5**: Add regression tests covering the new event-driven worker flow, the improved shutdown logic, restart reconciliation, and the dashboard detail mapping.

## Verification

- Run `npx nx test orchestrator` and `npx nx typecheck dashboard` after implementing the changes.
- Re-run any existing suite that touches the updated worker/orchestrator paths if they become fragile.
