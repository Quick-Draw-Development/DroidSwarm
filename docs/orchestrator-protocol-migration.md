# Protocol and Migration Guide

As of Phase 10 the orchestrator exchanges explicit execution events instead of relying on implicit status chatter. These events are stored in `task_events` (see `docs/orchestrator-architecture.md`) so the dashboard, auditors, or future services can follow every state change.

## Core events

Orchestrator messages now include the following execution-centric event types (with `event_type` stored in `task_events`):

- `EnvelopeV2`: normalized top-level transport fields for `id`, `ts`, project/run/task/room scope, actor role, compact `verb`, references, risk, and canonical `body`.
- `plan_proposed`: a worker suggested a decomposition plan; scheduler is creating child tasks.
- `task_assigned`: scheduler approved an attempt and delegated it to the supervisor.
- `spawn_requested` / `spawn_approved` / `spawn_denied`: worker-requested additional agents and scheduler judgment.
- `artifact_created`: worker produced a persistable artifact (summary, diagnostics).
- `checkpoint_created`: worker stored resumable state; scheduler can restart from this payload.
- `verification_requested`: verification or review stage has been queued.
- `verification_completed` / `review_completed`: a stage finished with a verdict.
- `task_ready`: a task is ready for scheduling (used by scheduler to fire dependencies).
- `task_blocked`: dependencies or policies prevent a task from running.
- `run_completed`: the overall run ended (success, failure, cancellation).
- `TaskStateDigest`: durable continuity artifact passed to helpers and used during recovery.
- `HandoffPacket`: durable helper handoff artifact pointing at the latest digest plus required reads.
- `budget_event`: there was a guardrail/budget hit.

The orchestrator continues to emit `status_update`, `task_created`, and `chat` envelopes, but those messages now reference the richer execution metadata above rather than implicitly changing state.

## Migration checklist

1. **Socket server**: keep emitting authenticated `task_events` rows and include the new `event_type` names in the `payload_json` so `task_events` can supply a readable timeline.
2. **Orchestrator**: ensure every scheduler decision calls the `TaskSchedulerEvents` hooks so `OrchestratorEngine` can convert them back into `EnvelopeV2` WebSocket traffic (`plan_proposed`, `checkpoint_created`, `verification_requested`, `verification_completed`).
3. **Dashboard**: migrate operator and task status views to read from `task_events`, `tasks`, `artifacts`, `checkpoints`, and `budget_events` rather than any in-memory placeholder lists (see `apps/dashboard/src/lib/db.ts` helpers).
4. **Operator chat**: parse intent from the message before mutating state. `OperatorActionService` now persists commands so audit trails survive restarts.
5. **Upgrade clients**: any automation that faked `status_update` to move a task needs to emit `task_events` entries (e.g., `task_ready`, `verification_requested`) so the scheduler sees the transition.
6. **Compatibility shim**: legacy event names remain valid at the ingestion boundary; `EnvelopeV2.verb` maps onto the existing execution-event model rather than replacing it.

## Verification

- Run `npx nx test orchestrator` to exercise the end-to-end flows that cover intake, decomposition, scheduling, verification/review, cancellation, and restart/resume.
- Use `npx nx typecheck dashboard` to confirm the UI still compiles against the persisted views.
- Inspect `docs/orchestrator-architecture.md` for the durable schema and workflow boundaries so the new protocol stays aligned with the rest of the stack.
