# Key Design Decisions & Rationale

1. Why custom WebSocket server instead of Slack/Mattermost?
   - Full control over protocol, no rate limits/channel sprawl
   - Mandatory per-message audit logging
   - Zero external dependencies for core functionality
   - Low latency for local/cluster deployment

2. Why task-specific rooms instead of single global chat?
   - Isolation prevents cross-task interference
   - Easier auditing (one log file per task)
   - Matches Symphony-inspired per-issue run model

3. Why human gate only at Review stage?
   - Balances autonomy with safety
   - Prevents un-reviewed code from merging
   - Allows full agent debate & execution without constant human babysitting

4. Why SQLite as the shared datastore?
   - Embedded database → no separate database server required for local installs
   - One datastore for tasks, channels, messages, and audit history
   - Easy to package for single-machine MVP and future self-hosted installs
   - Supports WAL mode and full-text search for local performance and searchability

5. Why one DroidSwarm per project?
   - Stronger isolation for repository access, credentials, prompts, and task history
   - Simpler setup and safer defaults for local/self-hosted installs
   - Easier auditing because all rooms, tasks, and artifacts belong to one project context
   - Still allows a shared SQLite database later by tagging every record with `project_id`

6. Current column flow (Kanban)
   To Do → Planning (multi-agent debate) → In Progress → Review (human) → Done
   Bug tasks skip Planning → go directly to In Progress

7. Dynamic agent spawning
   Agents send request_help → orchestrator validates & spawns → broadcasts spawned_agent message

8. MVP simplifications
   - Local SQLite database for tasks, channels, messages, and audit events
   - No TLS yet (ws://localhost)
   - Simple shared-secret auth for privileged clients in MVP

9. How task intake works
   - Dashboard persists task first to the shared local SQLite database
   - Dashboard then publishes `task_created` to a dedicated `operator` room on the WebSocket server
   - Only privileged clients (dashboard + orchestrator) may join `operator`
   - Orchestrator replies with `task_intake_accepted` to acknowledge receipt and begin processing

10. How human clarification works
   - The board prompts for a username on first load if no cookie is present and stores it locally in a cookie
   - The username must validate as lowercase letters, numbers, and underscores only so it can be safely stored and referenced
   - Tasks store that username as the human creator identity when they are created
   - If the orchestrator needs clarification, it can ask follow-up questions in the task context using `@mention`
   - The board highlights mentions for the task creator and routes their reply back into the same task/channel history
   - Clarification exchanges are part of the normal audit trail, not a side channel
   - User notifications beyond in-app mention indicators are deferred until later

11. How project identity works
   - Each DroidSwarm/orchestrator instance is scoped to a single project
   - Setup discovers a `project_name` from `package.json` name first, then the git repository name
   - If neither exists, setup prompts for a git repository path, checks out the project into the folder, and uses that repository name as `project_name`
   - Setup derives a normalized `project_id` from `project_name` for stable persistence and config
   - Setup should also persist an explicit `project_mode` (`greenfield` or `existing`)
   - Setup writes a project metadata file that the apps can read for canonical project variables
   - All persisted records include `project_id` so one SQLite database can support multiple projects later if needed

19. How setup should treat project documentation
   - Setup should use the Project Documentation Strategy Card to decide how project docs are initialized
   - In `greenfield` mode, setup should create starter project docs and enable initiative planning docs
   - In `existing` mode, setup should inspect and preserve existing docs, only adding DroidSwarm-managed docs where there are clear gaps

12. How branching works
   - Follow the intent of the git-flow model described by Vincent Driessen, but with project-specific adjustments for this DroidSwarm
   - The orchestrator must detect the development base branch as either `main` or `master`
   - The `production` branch is always treated as the live branch and the most protected branch
   - Hotfix branches must be created from `production` using the branch name format `hotfix/[task-id]`
   - Non-urgent bug fixes must be created from detected `main` or `master` using the branch name format `fix/[task-id]`
   - Feature branches must be created from the detected `main` or `master` branch using the branch name format `feature/[task-id]`
   - The detected branch settings should be written into the same generated project metadata file
   - Branching decisions should be explicit and auditable in task history

13. How sessions work
   - Durable session state should exist for task, agent, and human clarification contexts
   - Sessions should be stored in SQLite so work can resume after interruption
   - Session history should be scoped by `project_id`, task, room, and owner

14. How tracing works
   - Each orchestrator workflow on a task should create a structured trace
   - Traces should contain spans for intake, clarification, branch detection, handoffs, agent execution, tool actions, and review preparation
   - Trace data should be persisted in SQLite for debugging and auditability

15. How guardrails work
   - Deterministic guardrails should run before risky actions such as branch creation, code modification, PR creation, and merge
   - Guardrail failures should be persisted, visible in task history, and able to pause the workflow
   - Guardrails should validate task metadata, branch policy, review state, and other operational invariants

16. How handoffs work
   - Delegation between orchestrator, agents, and humans should be an explicit handoff event
   - Handoffs should record who transferred work, why, what context was passed, and the expected next outcome
   - Handoff history should be persisted and visible in the task audit trail

17. How agent communication works
   - Agent communication should optimize for structured machine-readable messages, not plain English chat
   - Every message should use a typed JSON envelope with compact fields and references where possible
   - Natural language should be optional and used only for reasoning summaries, human-facing explanations, or artifact descriptions
   - Operational coordination between agents should rely on concise message types such as status, handoff, help request, vote, guardrail event, and artifact reference
   - A controlled shorthand layer such as `droidspeak-v1` can be used for compressed agent reasoning summaries, but never as a replacement for canonical structured fields
   - The frontend should be able to translate supported shorthand into human-readable text on the fly
   - `droidspeak-v1` should be constrained by an explicit vocabulary and grammar to avoid drift

18. How usage accounting works
   - The system should track agent usage and token usage as first-class operational data
   - Usage should be attributable by `project_id`, task, trace, session, agent, and run where possible
   - Token accounting should support totals such as `total`, `input`, `cached_input`, `output`, and `reasoning_output`
   - Usage should be queryable for debugging, optimization, and future cost reporting

20. How limits and long-running sessions should work
   - The system should treat provider/API rate limits, token budgets, and context-window pressure as first-class operational constraints
   - The orchestrator should not rely on replaying full transcript history; it should work from structured summaries, durable facts, checkpoints, and recent deltas
   - Long-running orchestrator and agent sessions should support explicit context rollover when thresholds are approached
   - Limit hits, backoff, degraded execution, and checkpoint creation should be persisted as structured events
   - Side-effecting retries should be idempotent so branch creation, handoffs, and messages are not duplicated under retry pressure
   - The dashboard should surface limit pressure, checkpoint freshness, retry state, and degraded execution so humans can distinguish technical pressure from ordinary task blockers
