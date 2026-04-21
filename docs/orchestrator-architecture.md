# Orchestrator Architecture

This project now relies on `apps/orchestrator` as the durable control plane: it ingests socket messages, persists runs and task graphs, enforces policy via the scheduler, and delegates machine execution to the supervisor. The architecture is split into three orthogonal layers:

1. **Event ingestion and persistence**
   - `SocketGateway` reuses the existing WebSocket plumbing to authenticate and listen on the operator room plus per-task channels.
   - Incoming `task_created`, `status_update`, `chat`, and execution events are validated via the protocol schema and stored immediately in `task_events` plus the tables under `persistence/schema.ts`.
   - The persistence service (`OrchestratorPersistenceService`) offers a repository-style API for runs, tasks, attempts, dependencies, artifacts, checkpoints, budgets, operator actions, and verification reviews so no business logic touches raw SQL directly.

2. **Scheduler and state management**
    - `TaskScheduler` owns the task graph: it tracks queued workloads, enforces depth/fan-out limits, launches verified workers through the supervisor, starts verification/review stages, records checkpoints/artifacts, and emits policy/budget events. When side-effect-heavy artifacts are emitted, the scheduler blocks the attempt, records a budget event, and injects an explicit review task before allowing further work.
    - The scheduler now resolves each task’s policy by merging metadata overrides with the global `policyDefaults` from configuration and persists that `effective_policy` on every attempt, ensuring auditability and consistent enforcement after restarts.
   - `OrchestratorEngine` wires the scheduler to the `AgentSupervisor`, operator commands, and the gateway. It also keeps an agent→attempt map, normalizes incoming traffic through `EnvelopeV2`, and forwards structured events such as plan proposals, checkpoint creation, and verification outcomes to both the socket channel and the dashboard timeline.
   - `WorkerRegistry` is now a small helper for broadcasting agent presence; the durable persistence layer is the canonical source of truth.

3. **Supervisor and agent runtime**
   - `AgentSupervisor` is limited to process lifecycle tasks (spawn, terminate, callbacks, agent counting). It no longer interprets workflow topology or requested-agent fan-out directly.
   - Codex workers emit structured `CodexAgentResult` messages (status, requested agents, artifacts, compression) that the scheduler consumes, persists, and uses to gate the next action.
   - Spawned helpers receive the latest `TaskStateDigest` plus a `HandoffPacket` with required reads, preserving continuity without replaying the full room transcript.

## Execution Flow

1. Operator creates a task via the dashboard or CLI; the dashboard writes it locally and the socket server surfaces a `task_created` message.
2. `OrchestratorEngine.handleTaskCreated` registers the task, calls the scheduler, and publishes a `task_intake_accepted` response.
3. The scheduler looks at dependencies, policies, budgets, and local-first routing tiers, then asks the supervisor to start an agent attempt. Each attempt is logged in `task_attempts` and `agent_assignments`.
4. When an agent finishes with `CodexAgentResult`, the scheduler:
   - Persists artifacts/checkpoints/budget events as durable records.
   - Refreshes the `TaskStateDigest` and creates handoff packets for helper fanout and recovery.
   - Creates child tasks for requested agents and marks the parent as waiting.
   - Triggers verification/review stage tasks when implementation completes.
   - Emits execution events (`plan_proposed`, `task_assigned`, `verification_requested`, `verification_completed`, etc.) via the engine gateway and the `task_events` table to keep the dashboard timeline accurate.
5. Operator intents (cancel, review, reprioritize) are parsed, stored via `OperatorActionService`, and sent through explicit control actions rather than direct chat replies.

## Run recovery

The orchestrator starts by calling `RunLifecycleService.recoverInterruptedRuns()` before creating or resuming a run. Each non-terminal run on disk is reconciled: running attempts are marked failed, tasks lacking checkpoints are failed with a recorded reason, and tasks that can resume (queued/planning/waiting states or running tasks with checkpoints) are requeued and promoted back into the scheduler’s ready queues. Recovery emits `run_recovered` events describing how many tasks were resumed versus failed so the dashboard timeline stays honest.

Recovered runs only stay active when work actually resumes; otherwise the run is failed and a clear explanation persists. Every terminal transition (`run_completed`, `run_failed`, `run_cancelled`) goes through `RunLifecycleService`, so runs cannot remain implicitly running forever and the persisted events can be replayed to explain what happened after restart. Phase 10’s end-to-end tests (`apps/orchestrator/src/phase10-e2e.spec.ts`) now include restart/resume/finalization scenarios against the same SQLite database to validate these guarantees.

## Persistence Schema

The following tables are now the orchestrator’s ground truth (indexes on run/task/attempt columns keep lookups fast, and each schema migration is recorded in `schema_versions` for deterministic upgrades):

- `runs`: correlation for each user request.
- `tasks`: schedulable units with statuses (`queued`, `planning`, `running`, `waiting_on_dependency`, `waiting_on_human`, `in_review`, `verified`, `completed`, `failed`, `cancelled`).
- `task_attempts`: a single agent execution record per spawn.
- `agent_assignments`: which agents were assigned to which task attempts.
- `artifacts`: structured worker outputs attached to tasks.
- `checkpoints`: resumable payloads and summaries from agents.
- `task_state_digests`: durable continuity packets used for helper bootstrap and restart.
- `handoff_packets`: digest-linked helper handoffs with required reads.
- `budget_events`: limit/regulation hits.
- `task_dependencies`: explicit parent/child/dependency graph.
- `verification_reviews`: verification/review outcomes.
- `task_events`: extended execution events used by the dashboard timeline.
- `worker_results` / `worker_heartbeats`: include model-tier, queue-depth, and fallback telemetry for local-first routing.

## Dashboard Integration

`apps/dashboard` now reads the orchestrator database directly via `listRuns`, `listTaskNodesForRun`, `listArtifactsForRun`, `listCheckpointEvents`, `listBudgetEventsForRun`, `listAgentAssignmentsForRun`, `listVerificationOutcomesForRun`, and `listRunTimelineEvents`. The `OrchestrationInsights` panel surfaces run detail, the task dependency tree, a status timeline of scheduler events, artifacts, checkpoints, budgets, assignments, and verification history.

## Testing and Migration

- End-to-end coverage now includes `apps/orchestrator/src/phase10-e2e.spec.ts`, which exercises task intake, decomposition, scheduler assignment, worker completion, verification/review, cancellation, and restart scenarios. Run it via `npx nx test orchestrator`.
- Dashboard updates are type-checked with `npx nx typecheck dashboard`.
- Migration: ensure any custom scripts emit the new execution events (see `docs/orchestrator-protocol-migration.md`) and that any custom UI reads from `task_events` rather than ephemeral in-memory state.
