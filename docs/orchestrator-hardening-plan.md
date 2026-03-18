# Orchestrator Hardening Plan

## Current Flow (Phase 0 baseline)

- **Run lifecycle & persistence** – `apps/orchestrator/src/OrchestratorClient.ts` creates a `RunRecord` via `PersistenceClient` and builds `OrchestratorPersistenceService`. Tasks are stored via `persistence.tasks`, attempts via `persistence.attempts`, and the `TaskScheduler` orchestrates retries, checkpoints, verification, and review branches.
- **Dependency handling** – `TaskScheduler.createChildTasks` writes dependencies in `persistence.dependencies`, then uses `listDependencies` when deciding whether to un-block parents. Success currently treats completion/verification/failed/cancelled all as “satisfied.”
- **Worker ingestion** – `AgentSupervisor` forks codex worker processes, streams stdout/stderr for logging, and forwards `agent_result` messages into `TaskScheduler.handleAgentResult`. `TaskScheduler` immediately reacts, modifies task rows, and invokes persisted events via `OrchestratorPersistenceService`.
- **Transient registry** – `WorkerRegistry` lives under `apps/orchestrator/src/worker-registry.ts` and only tracks active agents, cancellation handles, and heartbeat timestamps; no workflow truth is stored there, so persistence must be the source of task state.
- **Policy resolution** – `TaskScheduler` now merges per-task metadata policies with global `policyDefaults` (from `OrchestratorConfig`), enforces depth/child/token/tool/timeout limits, and records the resolved `effective_policy` on each task attempt for observability and audits.
- **Operator command parsing** – `OperatorChatResponder`, `OrchestratorEngine`, and `operator/operator-intents.ts` parse freeform text into intents (`note` vs command) and apply them via `OperatorActionService`; commands are parsed via keyword matching, without explicit syntactic guardrails.
- **Dashboard data sources** – `apps/dashboard/src/lib/db.ts` currently queries `tasks`, `task_attempts`, `artifacts`, `checkpoints`, `verification_reviews`, `budget_events`, `agent_assignments`, and `task_events` derived from the same SQLite used by the orchestrator. UI components render columns based on `listBoardTasksForRun`, `getTaskDetails`, and supporting APIs.
- **Restart/recovery** – There is no explicit startup recovery; `OrchestratorClient.start()` creates a run and task graph and immediately starts scheduling. Resets do not reconcile existing runs or task attempts, so interrupted work is invisible.

## Identified Gaps

1. **Run lifecycle**: runs stay in `queued` until `TaskScheduler` first executes, and there is no `run_started/run_completed` event history or terminal state handling for cancellations/failures/orphans.
2. **Dependency semantics**: parents assume every dependency “finished” is success, so failures/cancellations invisibly allow parents to complete; no escalation mechanism exists.
3. **Durable events**: worker messages are handled directly via IPC (`AgentSupervisor`) and scheduler reactions mutate state before any event persistence, leaving replay or restart impossible.
4. **Registry responsibilities**: the runtime `WorkerRegistry` now only tracks live agent handles and assignments; the `tasks` table is the single source of truth for task metadata, status, and lifecycle.
5. **Policy resolution**: `TaskScheduler` now merges per-task metadata with the global `policyDefaults` configuration, enforces the combined limits, and persists each attempt’s `effective_policy` so enforcement decisions survive restarts.
6. **Side-effects**: side-effect artifacts now increment per-attempt counters, and reaching `sideEffectActionsBeforeReview` records a budget event, blocks the attempt, triggers a review stage, and emits a review request so operators can see why execution paused.
7. **Operator commands**: natural-language parsing easily interprets non-destructive chatter as destructive commands. There is no command syntax, confirmation, or auditable action log tied to structured operator input.
8. **Dashboard realism**: while the dashboard already queries persisted tables, sections such as “task events” and “solver messages” mirror synthetic channel logs; they must be tied to the new execution event stream.
9. **Recovery**: orchestrator restart does not inspect runs, attempts, or checkpoints, leading to orphaned tasks and untracked budgets, which conflicts with phase goals.

## File-by-file Change Plan

- `apps/orchestrator/src/OrchestratorClient.ts` & `main.ts`: inject run lifecycle tracking, recovery scan on startup (Phase 1/10), ensure scheduler receives durable event handles instead of direct IPC.
- `apps/orchestrator/src/engine/OrchestratorEngine.ts`: shift from inline status parsing to event-driven ingestion (Phase 3/7), persist operator actions/events, integrate structured operator commands.
- `apps/orchestrator/src/task-registry.ts`: rename/repurpose to runtime-only worker registry, separate active handles from persisted task status (Phase 4).
- `apps/orchestrator/src/persistence/{repositories,service}.ts`: add run lifecycle helper, new event tables (e.g., `execution_events`), support terminal run events, record effective policy & operator actions (Phase 1,3,5,7).
- `apps/orchestrator/src/scheduler/TaskScheduler.ts`: refactor dependency satisfaction logic, policy merge helper, side-effect gating hooks, restart reconciliation, scheduler triggered review creation, and events tied to persisted artifacts (Phases 2,5,6,10).
- `apps/orchestrator/src/operator/*`: build explicit command parser and auditing (Phase 7), ensure OperatorActionService records structured actions.
- `apps/orchestrator/src/socket/*`: maintain message gateways that consume persisted events; ensure subscriptions/responses align with new execution events (Phase 3/9).
- `apps/socket-server/src/*`: adapt server protocol to emit persisted events/backpressure to orchestrator timeline if needed (Phase 3,8,9).
- `apps/dashboard/src/lib/db.ts` & components: move placeholders to persisted data, surface run events/checkpoints/verification outcomes, display README-run status/notes (Phase 9).
- `docs/` (new docs/orchestrator-hardening-plan.md, README updates): capture documentation for run lifecycle, dependency semantics, events, policy, operator commands, and recovery steps (Phase 11).

## Migration & Test Considerations

- Schema migrations will likely touch `runs`, `tasks`, `task_attempts`, `dependencies`, `agent_assignments`, `artifacts`, `checkpoints`, `verification_reviews`, `budget_events`, and new `execution_events`/`operator_actions` tables. We'll version with `schema_version` table and add migrations plus startup checks (Phase 8).
- Testing: add unit/ integration coverage for run lifecycle transitions, dependency failure escalation, policy resolution, side-effect gating, operator command parsing, dashboard queries, and restart recovery simulations (Phases 1-10).
- Backward compatibility: ensure older local DBs upgrade by migrating new columns defaulting to safe values and keep CLI semantics unchanged while providing migration notes (Phase 8/11).

## Next Steps

1. Phase 1 run lifecycle work in orchestrator/persistence/engine + tests.
2. Phase 2 dependency and scheduler updates; add tests verifying parent failure handling.
3. Phase 3 event-persistence coverage across worker, scheduler, and socket server.
4. Phase 4 rename/refactor runtime registry and tighten in-memory concerns.
5. Phase 5-10 continue with policy, review gating, operator command hardening, indexing, dashboard integration, and restart/recovery.
