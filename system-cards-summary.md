# System Cards – Current State (as of March 11, 2026)

## 1. Agent Card
Defines how every agent is instantiated, named, and behaves.
- Name format: [Role]-[InstanceID] e.g. Planner-Alpha, Coder-Backend-03
- Must auth immediately on WebSocket connect
- Strict structured message protocol optimized for machine-readable coordination
- Follows orchestrator-provided branching rules for feature and hotfix work
- Receives explicit handoff context, participates in tracing, and respects workflow guardrails
- Reports usage and token accounting back to the system
- Can request additional agents via request_help message
- All actions visible in room for auditing

## 2. Planner Agent Card
Extends the Agent Card for planning specialists.
- Spawned during the planning stage to read docs, dissect requirements, and propose decompositions before any code is written.
- Emit structured `plan_proposed` artifacts with dependencies, risks, required helper roles, and doc refs before handing off to execution agents.
- Never create branches, PRs, or touch code; focus on authoring plan summaries and surfacing missing context so downstream agents inherit consistent instructions.

## 3. Coding Agent Card
Extends the Agent Card for implementation work.
- Operate on orchestrator-assigned branches (`feature/[task-id]`, `fix/[task-id]`, `hotfix/[task-id]`) and log the branch name and base branch to the task room before editing.
- Run the orchestrator-approved validation commands, summarize the tests run, and share artifacts before announcing that a PR is ready.
- Create the PR, attach the test summary, link to branch and reviewers, and publish the URL+status in the task channel so the orchestrator can move the task to Review.

## 4. Orchestrator Card
Central controller ("super admin")
- One orchestrator/DroidSwarm instance per project
- Subscribes to privileged `operator` room for `task_created` events
- Acknowledges intake with `task_intake_accepted` and classifies bug vs feature/task
- Can `@mention` the task creator to request clarification and receive replies in the same task context
- Stops and removes active agents when a task is moved into the Cancelled lane
- Detects whether the development base branch is `main` or `master`, and treats `production` as the live protected branch
- Uses `feature/[task-id]`, `fix/[task-id]`, and `hotfix/[task-id]` branch names based on task type
- Reads canonical project variables from the generated setup metadata file
- Owns task traces, guardrail checks, session persistence, and explicit handoff records
- Aggregates usage and token metrics across agents and tasks
- Uses checkpoints, context rollover, and degraded execution modes to handle long-running sessions safely
- Creates task-specific rooms for planning & complex execution
- Spawns agents (initial set + dynamic on request_help)
- Handles review cycle (human gate)
- Observes all rooms, broadcasts system messages
- Manages lifecycle (terminate room/agent on done)

## 5. Next.js Application Card – DroidSwarm Dashboard
Local UI for task management & visibility
- Scoped to a single project/DroidSwarm instance
- Prompts for a username using lowercase letters, numbers, and underscores only, then stores it in a cookie for MVP identity
- Kanban board (/board) with columns: To Do, Planning, In Progress, Review, Done, Cancelled
- Task cards show agents, status, link to channel view
- Supports moving tasks into Cancelled by drag-and-drop and from the task view
- Per-task channel viewer (/channels/[taskId]) shows real-time thread + history
- Add New Task modal persists task, then publishes `task_created` to privileged `operator` room
- Reads and writes tasks/channel history from a shared local SQLite database
- Passes the active `project_id` with all task and channel operations
- Surfaces orchestrator `@mentions` to the task creator and lets them reply from the board/channel UI
- Shows task state related to traces, guardrail failures, handoffs, and clarification status
- Shows health data such as token usage, checkpoint freshness, retry/backoff state, and limit pressure
- Can render and translate controlled shorthand such as `droidspeak-v1` for agent messages
- Uses WebSocket client to our custom server
- Tech: Next.js 15+, TypeScript, Tailwind + shadcn/ui, Zustand/TanStack Query

## 6. WebSocket Server Card – Agent Communication Hub
Node.js + TypeScript real-time server
- One server instance per project/DroidSwarm in MVP
- ws://localhost:8765
- Per-task rooms with isolated pub/sub
- Strict auth (agent name uniqueness per room)
- Persists messages and audit events to the shared local SQLite database
- Tags persisted rows with `project_id`
- Carries mention/clarification messages between orchestrator and humans in task rooms
- Carries system events for traces, guardrails, sessions, and handoffs when needed
- Validates a compact typed protocol rather than relying on freeform English messages
- Supports heartbeat, rate limiting, and a privileged `operator` room for dashboard/orchestrator control traffic
- Core classes: RoomManager, Room

## 7. Initial Setup Card
Bootstrap/install workflow for local environments
- Verifies required runtimes and tools are installed
- Installs missing app dependencies where possible
- Creates or migrates the shared local SQLite database
- Detects `project_name`, derives normalized `project_id`, records `project_mode`, and passes them to the apps
- Generates a project metadata file with canonical project variables such as project identity and branch settings
- Initializes or inspects project documentation based on greenfield vs existing-project mode
- Writes baseline configuration so the board and socket server point at the same datastore

## 8. Database Schema Card
Canonical SQLite schema for the system
- Defines tables for projects, users, tasks, channels, messages, sessions, traces, guardrails, handoffs, usage, connections, and audit events
- Adds session checkpoints and limit events for safe recovery and operability
- Ensures major records are scoped by `project_id`
- Gives setup, orchestrator, dashboard, and socket server a shared persistence contract

## 9. Message Protocol Card
Canonical communication protocol for agents and orchestrator
- Defines the typed JSON envelope and compact message taxonomy
- Keeps operational coordination machine-readable and auditable
- Allows optional natural-language content only where it adds value
- Includes structured usage reporting fields/events for token accounting
- Includes structured limit and checkpoint events for throttling, rollover, and recovery
- Supports optional controlled shorthand for compressed agent summaries with frontend translation

## 10. Droidspeak Card
Controlled shorthand spec for compressed agent summaries
- Defines `droidspeak-v1` grammar, vocabulary, validation, and translation rules
- Keeps shorthand constrained enough for frontend expansion and audit review
- Explicitly prevents shorthand from replacing canonical structured protocol fields

## 11. Project Documentation Strategy Card
Documentation strategy for target projects managed by a swarm
- Defines greenfield vs existing-project documentation behavior
- Separates long-lived project docs from tasks and optional initiative plans
- Guides when `exec-plans` should exist and how project docs should support agents

Current implementation progress (WebSocket server):
- RoomManager.ts: getOrCreateRoom, add/remove client, route messages, broadcastToRoom
- Room.ts: client tracking, name uniqueness, broadcast, handleMessage, logging hook
