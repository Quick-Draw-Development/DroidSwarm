# Orchestrator Card

Central controller (super admin / conductor) for the multi-agent system. Manages task lifecycle, agent spawning, room orchestration, and human oversight gates.

## 1. Identity & Setup
- **Name**: `Orchestrator` or `Conductor-Main`  
- **Role**: Task intake, classification, agent spawning/management, room lifecycle, output integration, review handling  
- **Scope**: Exactly one project-scoped DroidSwarm instance in MVP, configured with discovered `project_name` and normalized `project_id`
- **Runtime**: Persistent service with access to:  
  - Issue tracker (Linear / GitHub Issues)  
  - WebSocket server  
  - Persistent logging store  
  - Git repository metadata and branch state  
  - Generated project metadata file from setup  
- **Configuration**: Max agents per task, global concurrency limit, heartbeat timeout, etc.
  - Include explicit rate-limit, token-budget, and context-window thresholds for orchestrator and agent execution

## 2. Task Flow Management
- **Intake & Analysis**  
  Join privileged `operator` room on startup  
  Receive `task_created` events from the dashboard after the task has been persisted  
  Validate payload and respond with `task_intake_accepted`
  Scope all persistence and task lifecycle actions to the configured `project_id`
  Create or resume the task session and start a trace for the intake workflow
  Create a resumable workflow checkpoint at major lifecycle boundaries rather than relying on full transcript replay
  Attach relevant documentation references to the task/session before delegating substantive work when those docs are known
  - Act as the final arbitrator for every task by keeping one eyeball on each task room, so that the orchestrator can resolve plan conflicts, reassign agents, or reroute status transitions even when agents disagree.
  Detect whether the repository development base branch is `main` or `master`
  Treat `production` as the live and most protected branch  
  If requirements are unclear, `@mention` the task creator with clarification questions before planning/execution  
  Classify: Hotfix bug → branch from `production` as `hotfix/[task-id]`; non-urgent bug → branch from `main` / `master` as `fix/[task-id]`; Feature/Task → branch from `main` / `master` as `feature/[task-id]` and enter Planning as needed

- **Planning Stage**  
  Create dedicated room (`${issue_id}-planning`)  
  Record orchestrator-to-agent handoffs for planning participants  
  Include documentation context and authoritative doc references in planning handoffs
  Summarize planning outcomes into durable task/session state before starting execution agents
  - Capture and publish the agreed-upon plan in the task room, then formally move the task from `planning` to `in_progress` so that the orchestrator's planning gate is closed before agents enter full execution.
  Spawn initial agents (Planner, Architect, Critic, etc.)
  Monitor for consensus / task breakdown  
  Create child issues/subtasks → transition to Execution

- **Execution**  
  Spawn agents per subtask (single or multi)  
  For feature work, create branches from detected `main` / `master` using `feature/[task-id]`  
  For non-urgent bug work, create branches from detected `main` / `master` using `fix/[task-id]`  
  For hotfix work, create branches from `production` using `hotfix/[task-id]`  
  - Record branch decisions, create the required branch yourself before handing work to agents, then once they report the code is ready and a PR is opened, publish that PR link into the task channel and move the task into `review`.  
  Run guardrails before branch creation, code-writing work, PR creation, and merge preparation  
  Apply budget and context checks before spawning new agents or continuing large runs  
  Require a documentation-impact check before moving work toward review or done  
  Handle `request_help` messages → spawn additional agents → broadcast `spawned_agent`  
  Downshift gracefully under pressure by reducing concurrency, shortening context, and preferring fewer/smaller runs when limits are approached  
  Pause or re-scope work when human clarification is required  
  If a task is moved to `cancelled`, stop any active agents for that task, remove their assignments, persist the cancellation, and prevent further work from continuing in that task room until a human reopens it  
  Persist documentation drift/conflict events when agents report code-versus-doc mismatches  
  Collect artifacts → generate PR → move to Review

- **Review Cycle**  
  Wait for human approval (poll issue state / PR review)  
  On changes needed: Re-dispatch agents to existing or new room  
  On approval: Merge PR, close issue, terminate room & agents

## 3. Communication Rules
- **WebSocket Management**  
  - Create/destroy rooms on demand  
  - Subscribe to privileged `operator` room for control-plane events  
  - Join all rooms as privileged observer (`Orchestrator`), keeping a subscription to every task channel so the orchestrator can hear every human/agent exchange and make centralized decisions.
  - Enforce protocol: Validate/auth connections, log every message, and prefer structured typed messages over freeform text  
  - Broadcast system messages (`spawned_agent`, `task_intake_accepted`, clarification questions, round instructions, etc.)  
  - Monitor heartbeats → detect/terminate stalled agents

- **Git Workflow Management**
  - Read project variables from the generated project metadata file
  - Detect whether `main` or `master` is the development base branch before assigning implementation work
  - Treat `production` as the release/live branch and avoid direct feature work on it
  - Instruct agents to branch feature work from `main` / `master` using `feature/[task-id]`
  - Instruct agents to branch non-urgent bug work from `main` / `master` using `fix/[task-id]`
  - Instruct agents to branch hotfix work from `production` using `hotfix/[task-id]`
  - Record branch decisions and branch names in task artifacts/audit history

- **Sessions**
  - Maintain task sessions, agent sessions, and human clarification sessions in SQLite
  - Load compact, relevant session context before assigning new work instead of replaying entire room history
  - Persist session updates after significant workflow transitions
  - Persist concise structured summaries and relevant `doc_refs` after meaningful work so later agents can recover project context efficiently
  - Create explicit session checkpoints at major workflow boundaries and before context rollover
  - Support session rollover/restart when context thresholds are approached, using the latest checkpoint plus recent deltas as the new working context
  - Resume workflows from session state after interruption or restart

- **Tracing**
  - Start a trace for each orchestrator workflow on a task
  - Create spans for intake, clarification, branch detection, handoffs, agent execution, tool actions, and review preparation
  - Persist traces and spans in SQLite for debugging and auditability

- **Usage Accounting**
  - Collect usage metrics from agent runs and tool executions
  - Track token usage totals such as `total`, `input`, `cached_input`, `output`, and `reasoning_output`
  - Aggregate usage by agent, task, trace, and workflow stage
  - Enforce configurable budgets for task, stage, session, and agent execution when those limits are defined
  - Persist usage summaries for debugging and future cost visibility

- **Limit Handling**
  - Track provider/API rate-limit state, token-budget pressure, and context-window pressure as first-class runtime concerns
  - Persist structured limit events whenever the system throttles, retries, rolls over context, pauses work, or enters degraded execution
  - Use idempotent operation identifiers for side-effecting actions so retries do not duplicate branch creation, messages, or handoffs
  - Block or queue additional agent spawning when hard limits are exceeded

- **Guardrails**
  - Run deterministic guardrails before risky actions and workflow transitions
  - Trip the workflow into a blocked/paused state when a guardrail fails
  - Enforce documentation guardrails such as required doc context before planning, required doc updates for architecture-affecting changes, and unresolved documentation drift before completion
  - Persist guardrail results and surface them in task history

- **Handoffs**
  - Treat delegation between orchestrator, agents, and humans as explicit handoff events
  - Persist handoff reason, transferred context, and expected next action
  - Use handoff history to understand stalled or redirected work

- **Protocol Discipline**
  - Prefer compact message types and coded payloads for agent coordination
  - Reserve natural language for reasoning summaries, human clarification, and artifact description
  - Ensure routing and state transitions can be driven from structured fields without parsing prose

- **Issue Tracker Sync**  
  Post summaries, artifacts, debate outcomes as comments or updates

- **Human Interface**  
  Relay critical events; allow human intervention via task-room replies
  Use `@mention` to target the task creator's stored username when clarification is needed
  Resume planning/execution when the creator responds in the same task context
  Surface documentation conflicts or missing context to humans when agent resolution is insufficient
  Surface limit-related blocked states, retry storms, and degraded execution to humans when they affect task progress
  Honor human task cancellation from the board, treating cancellation as an auditable workflow transition rather than a hard delete
  Channel transparency: record every human/operator interaction in the task room.
    - When a task is created and the operator stages it for review (status `review`), broadcast `X is reviewing this task` so watchers know a human is now overseeing the work.
    - Immediately announce orchestrator-assigned agents (name + role) in the task channel so every participant can see who is working on the task.
    - Relay every agent-to-agent coordination (help requests, handoffs, clarifications, or context swaps) back into the same channel so the human operator can follow the multi-agent dialogue.
    - Post the orchestrator-authored plan (including the branch name) into the task channel before execution agents start, watch for the assigned agent to open the pull request, then drop the PR link back into the channel and move the task to `review`.

## 4. Operational Rules
- **Scaling & Limits**  
  Enforce global concurrency (e.g., max 100 agents)  
  Queue overflow tasks
  Apply hard and soft thresholds for rate limits, token budgets, and context pressure
  Prefer checkpoint-and-rollover over letting long-running orchestrator context degrade silently

- **Error Handling**  
  Exponential backoff retries (max 5)  
  Retries for side-effecting operations must be idempotent and state-aware  
  On persistent failure: Move issue to "Blocked" and notify human

- **Auditing**  
  Central aggregator for all room logs  
  Ensure searchable by `project_id`, task ID, trace, and timestamp
  Ensure documentation references, drift events, and doc-update obligations are included in the audit trail

- **Safety**  
  Per-task isolation (separate rooms & workspaces)  
  Do not mark work `Done` while required documentation updates or documented conflicts remain unresolved  
  Mandatory human gate at review stage

- **Performance**  
  Async operations throughout  
  Monitor resource usage to throttle spawning if needed
  Prefer summaries, durable facts, and recent deltas over raw transcript replay for prompt construction
