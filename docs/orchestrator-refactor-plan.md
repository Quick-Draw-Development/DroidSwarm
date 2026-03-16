# Orchestrator Refactor Plan

## Current Flow

### apps/orchestrator
- `apps/orchestrator/src/main.ts` boots `DroidSwarmOrchestratorClient`, connects sockets, and forks worker (`worker.ts`) when requested.
- `OrchestratorClient.ts` manages a WebSocket gateway, accepts `task_created`/`chat`/`status_update`, registers tasks in `task-registry.ts`, replies with `task_intake_accepted`, and calls `AgentSupervisor` to spool workers.
- `AgentSupervisor.ts` forks Node workers, tracks active agent names in an in-memory `Map`, and listens for `agent_result` messages to trigger immediate `spawnRequests`.
- `worker.ts` authenticates as an agent, sends status updates, runs `runCodexPrompt`, and returns structured `CodexAgentResult` (summary, requested agents, artifacts).
- Protocol and payloads are defined in `protocol.ts` + `messages.ts`; typed via Zod schemas in `protocol.ts`.
- Task topology/state is entirely in `apps/orchestrator/src/task-registry.ts` (in-memory `Map` with statuses `pending`/`cancelled` plus `activeAgents`).

### apps/socket-server
- `apps/socket-server/src/server.ts` runs a WebSocket server, authenticates clients via `auth`, routes messages to rooms through `RoomManager`, and persists them via `SqlitePersistence` (`db/repositories.ts` + schema).
- Storage includes `channels`, `messages`, `connections`, `task_events`, etc. but orchestrator neither reads nor writes these tables.
- `RoomManager`/`Room` track client membership so rooms like `operator` and task-specific rooms relay messages.

### apps/dashboard
- `apps/dashboard/src/lib/db.ts` reads `tasks`, `messages`, `channels` from the SQLite file created by the socket server and exposes helpers (`listTasks`, `getTaskDetails`) for Next.js pages.
- `apps/dashboard/src/app/channels/[taskId]/page.tsx` renders `Active Agents`, `ChannelRoom` chat, and `TaskStatusAction`.
- UI still shows placeholder agents because active agent lists are synthesized, not based on persisted orchestrator state.

## Key Touchpoints
- In-memory task state: `apps/orchestrator/src/task-registry.ts`
- Worker spawn logic: `AgentSupervisor.ts`, `OrchestratorClient.ts`
- Message/protocol definitions: `protocol.ts`, `messages.ts`, `types.ts`
- Persistence layer: socket server database (`apps/socket-server/src/db/*`), dashboard DB helpers (`apps/dashboard/src/lib/db.ts`)
- Dashboard views for state: `apps/dashboard/src/app/channels/[taskId]/page.tsx`, `ChannelRoom.tsx`, sidebar cards

## Gaps
- The orchestrator's source of truth lives in memory (`TaskRegistry`), so process restarts lose task topology, retries, and assignments.
- Worker-directed `requested_agents` immediately spawn new processes; no scheduler approves decomposition or respects durability/weaving.
- Protocol lacks execution-specific event types (`plan_proposed`, `artifact_created`, `task_assigned`, etc.), making it hard to reason about workflow state.
- Operator chat is tightly coupled to Codex prompts, so conversational commands can mutate state without explicit actions.
- Artifacts and checkpoints produced by workers are transient and not stored for review/resume.

## Target Flow
- `OrchestratorClient` will become a gateway that ingests events, persists task/runs, and publishes them to the scheduler/engine.
- A scheduler component decides which tasks are runnable, respects dependencies and policies, and issues assignments to `WorkerSupervisor`.
- Worker outputs become durable artifacts/checkpoints linked to `task_attempts`, allowing replay and resumed execution.
- Protocols define discriminated execution events (e.g., `plan_proposed`, `task_ready`, `artifact_created`), and socket server routes them like any other message.
- Operator chat is interpreted into intents/commands that invoke scheduler/orchestrator actions separately from conversational responses.

## Proposed Module Boundaries
- **SocketGateway**: Reuse `OrchestratorClient.ts` for WebSocket lifecycles but hand off parsed events (`protocol.ts`) to an engine rather than making decisions inline.
- **OrchestratorEngine**: Lives under `apps/orchestrator/src/engine/` and owns durable state writes (runs/tasks), scheduler hooks, dependency management, and status transitions.
- **Scheduler**: New module (`apps/orchestrator/src/scheduler/`) that reads persisted task graph, respects budgets, enforces fan-out/depth limits, and tells `WorkerSupervisor` when to start attempts.
- **WorkerSupervisor**: Refined `AgentSupervisor.ts`, kept under `supervisor/`, focusing on process lifecycle, not topology.
- **Persistence Layer**: New `apps/orchestrator/src/persistence/` with repository abstractions over SQLite (runs/tasks/attempts/assignments/artifacts/checkpoints/budget events).
- **OperatorCommandHandler**: Parses operator room chat into explicit control actions used by `OrchestratorEngine`/`Scheduler` rather than the current `runCodexPrompt` path.
- **Types/Protocol**: Extend `types.ts` and `protocol.ts` with discriminated unions for execution events, budget policies, and artifact metadata.

## Phase 0 Next Steps
1. Capture this architecture note (done).
2. For Phase 1 we will add persistence tables + repository abstractions.
3. Subsequent phases will introduce scheduler, richer protocol events, artifact persistence, policy enforcement, operator command separation, and dashboard updates.
