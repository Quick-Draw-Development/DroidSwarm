# Orchestrator Run Lifecycle Guide

This guide summarizes the hardened control-plane guarantees that the orchestrator now provides.

## Run lifecycle states

- **queued**: The run was created (operator intake accepted) but no agent has been scheduled yet.
- **running**: At least one task from the run is actively scheduled or being retried; this state starts when `RunLifecycleService.startRun` is called.
- **completed/failed/cancelled**: Terminal states emitted via `RunLifecycleService.completeRun`, `.failRun`, or `.cancelRun`, each of which records a `run_completed`, `run_failed`, or `run_cancelled` execution event.

Every transition is persisted in both the `runs` table and the `execution_events` timeline so dashboards, audits, and future services can understand why the run ended.

## Dependency semantics and task progression

- Tasks default to a dependency lock: children must reach `completed` or `verified` before parents proceed.
- Required dependencies that fail or cancel mark parents as `failed` (with `blocked_reason` metadata) and emit budget/policy events for observability.
- The scheduler includes explicit statuses such as `waiting_on_dependency`, `waiting_on_human`, `in_review`, and `verified` so the UI can show where work is stuck or awaiting verification.
- Tasks may propose child decompositions via `plan_proposed` events; the scheduler persists the new tasks, writes their dependencies, and only schedules them once policy/dependency checks pass.

## Durable execution events

- All business-critical changes are written first as `execution_events` (e.g., `plan_proposed`, `task_assigned`, `checkpoint_created`, `verification_requested`, `run_completed`). Worker IPC messages are validated, persisted, and then consumed so replay (and recovery) is deterministic.
- The dashboard timeline now queries `execution_events`, `budget_events`, `artifacts`, `checkpoints`, and `operator_actions` instead of relying on transient channel logs.
- Event metadata includes which agent/task triggered it, summary/detail text, and any policy or budget context, making it easy to rebuild the world view from the database.

## Policy enforcement

- The scheduler resolves policy for each task by merging global defaults (`policyDefaults` in configuration) with per-task overrides stored under `task.metadata.policy`.
- Effective policy values (max depth, max children, max tokens, max tool calls, allowed tools, timeout, approval policy) are recorded on each attempt so retry logic and operators have an audit trail.
- Guardrails such as `sideEffectActionsBeforeReview` emit budget events, block the attempt, and enqueue explicit review tasks when triggered.
- Disallowed policies (manual approval without approval, max tokens exceeded, disallowed tool usage, etc.) immediately transition the task into `waiting_on_human` and persist why the action stopped.

## Operator command model

- Operators send commands via chat (e.g., `/cancel <task-id>`, `/review`, `/priority <level>`). The `OperatorCommandParser` differentiates notes, structured commands, and malformed input.
- Safe notes are answered by the chat responder; structured commands go through `OperatorActionService`, which persists the action, emits an `operator_action` row, and returns an audited outcome (e.g., cancellation, review request, reprioritization).
- Ambiguous or destructive requests are rejected with a clear message that operators must re-send the command in the explicit form, preventing accidental cancellations.

## Restart and recovery guarantees

- On startup, `RunLifecycleService.recoverInterruptedRuns` scans for runs not in a terminal state. Running attempts are clobbered (they are marked `failed` with metadata explaining the interruption).
- Tasks that were in resumable states (queued/planning/waiting) or running tasks that have a checkpoint are requeued (`status = queued`) with recovery metadata, and their IDs are fed back into the scheduler’s ready queue.
- Tasks beyond recovery are marked `failed` (with `recovery_reason` metadata) and emit `run_recovered` events so dashboards and logs show why work was abandoned.
- Runs are only kept in `running` status after recovery if actual resumable work exists; otherwise the run is failed with a clear reason. All terminal transitions emit events such as `run_completed`, `run_failed`, and `run_cancelled`.
- Phase 10’s e2e test suite (`apps/orchestrator/src/phase10-e2e.spec.ts`) exercises intake → decomposition → restart/resume → verification/review → finalization and proves these guarantees against the persisted SQLite schema.
