# Database Schema Card

Canonical SQLite schema for the project-scoped DroidSwarm system. This card defines the durable tables needed for setup metadata, tasks, channels, messages, sessions, traces, guardrails, handoffs, usage accounting, and audit history.

## 1. Purpose & Scope
- Provide one shared SQLite schema for the dashboard, orchestrator, and WebSocket server
- Persist all durable workflow state for a single project-scoped DroidSwarm instance
- Ensure every major record is attributable to `project_id`
- Support future multi-project use of one database file by keeping `project_id` on all major tables

## 2. Core Rules
- Every major business table includes `project_id`
- Use UUID text primary keys for portability and explicit IDs
- Store timestamps as ISO 8601 UTC text
- Use SQLite `CHECK` constraints where simple invariants are stable
- Use JSON text columns only for flexible metadata, not for core relational structure
- Prefer soft lifecycle status fields over hard deletion for audit-heavy tables
- Unless otherwise stated, all `*_id` primary identifiers in this schema are UUIDs

## 3. Project Metadata Tables

### 3.1 `projects`
One row per configured project/DroidSwarm instance.

Columns:
- `project_id TEXT PRIMARY KEY`
- `project_name TEXT NOT NULL`
- `root_path TEXT NOT NULL`
- `metadata_file_path TEXT NOT NULL`
- `main_branch TEXT NOT NULL`
- `production_branch TEXT NOT NULL DEFAULT 'production'`
- `feature_branch_prefix TEXT NOT NULL DEFAULT 'feature/'`
- `fix_branch_prefix TEXT NOT NULL DEFAULT 'fix/'`
- `hotfix_branch_prefix TEXT NOT NULL DEFAULT 'hotfix/'`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Indexes:
- `UNIQUE(project_name, root_path)`

### 3.2 `project_settings`
Optional key/value settings discovered or written during setup.

Columns:
- `project_id TEXT NOT NULL`
- `key TEXT NOT NULL`
- `value TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `PRIMARY KEY (project_id, key)`
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`

## 4. Human Identity Tables

### 4.1 `users`
MVP local human identities captured by the board username gate.

Columns:
- `project_id TEXT NOT NULL`
- `user_id TEXT NOT NULL`
- `display_name TEXT NOT NULL`
- `source TEXT NOT NULL DEFAULT 'cookie'`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `PRIMARY KEY (project_id, user_id)`
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`

Notes:
- In MVP, `user_id` and `display_name` may be the same username value.

## 5. Task and Workflow Tables

### 5.1 `tasks`
Primary task records shown in the Kanban board.

Columns:
- `task_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `task_type TEXT NOT NULL`
- `priority TEXT NOT NULL`
- `status TEXT NOT NULL`
- `branch_type TEXT`
- `branch_name TEXT`
- `base_branch TEXT`
- `created_by_user_id TEXT NOT NULL`
- `created_by_display_name TEXT NOT NULL`
- `assigned_room_id TEXT`
- `needs_clarification INTEGER NOT NULL DEFAULT 0`
- `blocked_reason TEXT`
- `review_state TEXT`
- `metadata_json TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (project_id, created_by_user_id) REFERENCES users(project_id, user_id)`
- `CHECK (task_type IN ('feature', 'bug', 'hotfix', 'task'))`
- `CHECK (status IN ('todo', 'planning', 'in_progress', 'review', 'done', 'blocked'))`

Indexes:
- `INDEX tasks_project_status_idx (project_id, status, updated_at)`
- `INDEX tasks_project_creator_idx (project_id, created_by_user_id)`

### 5.2 `task_labels`
Normalized labels/tags for tasks.

Columns:
- `task_id TEXT NOT NULL`
- `label TEXT NOT NULL`

Constraints:
- `PRIMARY KEY (task_id, label)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`

### 5.3 `task_events`
Durable task lifecycle events not represented as chat messages.

Columns:
- `event_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT NOT NULL`
- `event_type TEXT NOT NULL`
- `actor_type TEXT NOT NULL`
- `actor_id TEXT NOT NULL`
- `payload_json TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`

Indexes:
- `INDEX task_events_task_idx (task_id, created_at)`

## 6. Channel and Message Tables

### 6.1 `channels`
Task rooms and the privileged operator room.

Columns:
- `channel_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `channel_type TEXT NOT NULL`
- `name TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `CHECK (channel_type IN ('operator', 'task', 'planning', 'execution', 'review'))`
- `CHECK (status IN ('active', 'archived', 'closed'))`

Indexes:
- `INDEX channels_project_task_idx (project_id, task_id)`

### 6.2 `channel_members`
Current or historical channel participants.

Columns:
- `channel_id TEXT NOT NULL`
- `member_type TEXT NOT NULL`
- `member_id TEXT NOT NULL`
- `member_name TEXT NOT NULL`
- `member_role TEXT`
- `joined_at TEXT NOT NULL`
- `left_at TEXT`
- `last_seen_at TEXT`

Constraints:
- `PRIMARY KEY (channel_id, member_type, member_id, joined_at)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `CHECK (member_type IN ('orchestrator', 'agent', 'human', 'system'))`

Indexes:
- `INDEX channel_members_active_idx (channel_id, left_at)`

### 6.3 `messages`
Canonical task/channel message history.

Columns:
- `message_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `channel_id TEXT NOT NULL`
- `task_id TEXT`
- `session_id TEXT`
- `trace_id TEXT`
- `parent_message_id TEXT`
- `message_type TEXT NOT NULL`
- `sender_type TEXT NOT NULL`
- `sender_id TEXT NOT NULL`
- `sender_name TEXT NOT NULL`
- `content TEXT`
- `payload_json TEXT`
- `reply_to_message_id TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (parent_message_id) REFERENCES messages(message_id)`
- `FOREIGN KEY (reply_to_message_id) REFERENCES messages(message_id)`

Indexes:
- `INDEX messages_channel_created_idx (channel_id, created_at)`
- `INDEX messages_task_created_idx (task_id, created_at)`
- `INDEX messages_trace_idx (trace_id)`

### 6.4 `message_mentions`
Mention targets extracted from messages.

Columns:
- `message_id TEXT NOT NULL`
- `mentioned_type TEXT NOT NULL`
- `mentioned_id TEXT NOT NULL`
- `mentioned_name TEXT NOT NULL`
- `created_at TEXT NOT NULL`

Constraints:
- `PRIMARY KEY (message_id, mentioned_type, mentioned_id)`
- `FOREIGN KEY (message_id) REFERENCES messages(message_id)`
- `CHECK (mentioned_type IN ('human', 'agent', 'orchestrator'))`

Indexes:
- `INDEX message_mentions_target_idx (mentioned_type, mentioned_id, created_at)`

## 7. Session Tables

### 7.1 `sessions`
Durable workflow memory containers.

Columns:
- `session_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `channel_id TEXT`
- `session_type TEXT NOT NULL`
- `owner_type TEXT NOT NULL`
- `owner_id TEXT NOT NULL`
- `status TEXT NOT NULL`
- `summary TEXT`
- `started_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `closed_at TEXT`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `CHECK (session_type IN ('task', 'agent', 'clarification'))`
- `CHECK (owner_type IN ('orchestrator', 'agent', 'human'))`
- `CHECK (status IN ('active', 'paused', 'closed'))`

Indexes:
- `INDEX sessions_task_idx (task_id, session_type, status)`

### 7.2 `session_items`
Ordered entries belonging to a session.

Columns:
- `session_item_id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `item_type TEXT NOT NULL`
- `actor_type TEXT NOT NULL`
- `actor_id TEXT NOT NULL`
- `content TEXT`
- `payload_json TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (session_id) REFERENCES sessions(session_id)`
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`

Indexes:
- `INDEX session_items_session_idx (session_id, created_at)`

### 7.3 `session_checkpoints`
Compact resumable checkpoints for long-running sessions and workflow boundaries.

Columns:
- `checkpoint_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `session_id TEXT NOT NULL`
- `task_id TEXT`
- `trace_id TEXT`
- `checkpoint_type TEXT NOT NULL`
- `summary TEXT`
- `facts_json TEXT`
- `recent_delta_json TEXT`
- `created_by_type TEXT NOT NULL`
- `created_by_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (session_id) REFERENCES sessions(session_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`
- `CHECK (checkpoint_type IN ('workflow_boundary', 'context_rollover', 'pre_restart', 'manual'))`
- `CHECK (created_by_type IN ('orchestrator', 'agent', 'human', 'system'))`

Indexes:
- `INDEX session_checkpoints_session_idx (session_id, created_at)`
- `INDEX session_checkpoints_task_idx (task_id, created_at)`

## 8. Tracing Tables

### 8.1 `traces`
Top-level workflow traces.

Columns:
- `trace_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `channel_id TEXT`
- `workflow_name TEXT NOT NULL`
- `status TEXT NOT NULL`
- `started_by_type TEXT NOT NULL`
- `started_by_id TEXT NOT NULL`
- `started_at TEXT NOT NULL`
- `ended_at TEXT`
- `metadata_json TEXT`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))`

Indexes:
- `INDEX traces_task_idx (task_id, started_at)`

### 8.2 `spans`
Nested trace spans.

Columns:
- `span_id TEXT PRIMARY KEY`
- `trace_id TEXT NOT NULL`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `parent_span_id TEXT`
- `span_type TEXT NOT NULL`
- `name TEXT NOT NULL`
- `status TEXT NOT NULL`
- `started_at TEXT NOT NULL`
- `ended_at TEXT`
- `metadata_json TEXT`

Constraints:
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (parent_span_id) REFERENCES spans(span_id)`
- `CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))`

Indexes:
- `INDEX spans_trace_idx (trace_id, started_at)`
- `INDEX spans_parent_idx (parent_span_id)`

## 9. Guardrail Tables

### 9.1 `guardrail_events`
Results of deterministic workflow checks.

Columns:
- `guardrail_event_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `trace_id TEXT`
- `span_id TEXT`
- `guardrail_name TEXT NOT NULL`
- `phase TEXT NOT NULL`
- `result TEXT NOT NULL`
- `details_json TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`
- `FOREIGN KEY (span_id) REFERENCES spans(span_id)`
- `CHECK (phase IN ('input', 'pre_action', 'output', 'transition'))`
- `CHECK (result IN ('pass', 'fail', 'tripwire'))`

Indexes:
- `INDEX guardrail_events_task_idx (task_id, created_at)`
- `INDEX guardrail_events_trace_idx (trace_id, created_at)`

## 10. Handoff Tables

### 10.1 `handoffs`
Explicit delegation events between actors.

Columns:
- `handoff_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT NOT NULL`
- `trace_id TEXT`
- `from_actor_type TEXT NOT NULL`
- `from_actor_id TEXT NOT NULL`
- `to_actor_type TEXT NOT NULL`
- `to_actor_id TEXT NOT NULL`
- `reason TEXT NOT NULL`
- `context_json TEXT`
- `expected_outcome TEXT`
- `status TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`
- `CHECK (from_actor_type IN ('orchestrator', 'agent', 'human', 'system'))`
- `CHECK (to_actor_type IN ('orchestrator', 'agent', 'human', 'system'))`
- `CHECK (status IN ('open', 'accepted', 'completed', 'cancelled'))`

Indexes:
- `INDEX handoffs_task_idx (task_id, created_at)`
- `INDEX handoffs_to_actor_idx (to_actor_type, to_actor_id, status)`

## 11. Usage Tables

### 11.1 `usage_records`
Structured usage and token accounting for agent/model/tool runs.

Columns:
- `usage_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `channel_id TEXT`
- `session_id TEXT`
- `trace_id TEXT`
- `span_id TEXT`
- `agent_id TEXT`
- `actor_type TEXT NOT NULL`
- `run_id TEXT`
- `usage_scope TEXT NOT NULL`
- `model_name TEXT`
- `tool_name TEXT`
- `total_tokens INTEGER`
- `input_tokens INTEGER`
- `cached_input_tokens INTEGER`
- `output_tokens INTEGER`
- `reasoning_output_tokens INTEGER`
- `metadata_json TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `FOREIGN KEY (session_id) REFERENCES sessions(session_id)`
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`
- `FOREIGN KEY (span_id) REFERENCES spans(span_id)`
- `CHECK (actor_type IN ('orchestrator', 'agent', 'human', 'system', 'tool'))`
- `CHECK (usage_scope IN ('run', 'message', 'tool_call', 'session', 'task', 'trace'))`

Indexes:
- `INDEX usage_records_task_idx (task_id, created_at)`
- `INDEX usage_records_agent_idx (agent_id, created_at)`
- `INDEX usage_records_trace_idx (trace_id, created_at)`

### 11.2 `usage_rollups`
Optional precomputed summaries for fast dashboard/orchestrator reads.

Columns:
- `rollup_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `scope_type TEXT NOT NULL`
- `scope_id TEXT NOT NULL`
- `total_tokens INTEGER NOT NULL DEFAULT 0`
- `input_tokens INTEGER NOT NULL DEFAULT 0`
- `cached_input_tokens INTEGER NOT NULL DEFAULT 0`
- `output_tokens INTEGER NOT NULL DEFAULT 0`
- `reasoning_output_tokens INTEGER NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `CHECK (scope_type IN ('project', 'task', 'session', 'trace', 'agent'))`

Indexes:
- `INDEX usage_rollups_scope_idx (project_id, scope_type, scope_id)`

## 12. Limit and Health Tables

### 12.1 `limit_events`
Structured records for rate limits, token budgets, context pressure, backoff, and degraded execution.

Columns:
- `limit_event_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `channel_id TEXT`
- `session_id TEXT`
- `trace_id TEXT`
- `span_id TEXT`
- `actor_type TEXT NOT NULL`
- `actor_id TEXT`
- `limit_type TEXT NOT NULL`
- `scope_type TEXT NOT NULL`
- `scope_id TEXT`
- `status TEXT NOT NULL`
- `threshold_name TEXT`
- `current_value REAL`
- `threshold_value REAL`
- `retry_after_ms INTEGER`
- `degraded_mode TEXT`
- `details_json TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `FOREIGN KEY (session_id) REFERENCES sessions(session_id)`
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`
- `FOREIGN KEY (span_id) REFERENCES spans(span_id)`
- `CHECK (actor_type IN ('orchestrator', 'agent', 'system', 'tool'))`
- `CHECK (limit_type IN ('rate_limit', 'token_budget', 'context_window', 'concurrency'))`
- `CHECK (scope_type IN ('project', 'task', 'session', 'trace', 'agent', 'swarm'))`
- `CHECK (status IN ('near_limit', 'exceeded', 'backing_off', 'rolled_over', 'degraded', 'recovered'))`

Indexes:
- `INDEX limit_events_task_idx (task_id, created_at)`
- `INDEX limit_events_session_idx (session_id, created_at)`
- `INDEX limit_events_scope_idx (project_id, scope_type, scope_id, created_at)`

## 13. Connection and Audit Tables

### 13.1 `connections`
Socket connection lifecycle records.

Columns:
- `connection_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `channel_id TEXT`
- `client_type TEXT NOT NULL`
- `client_id TEXT NOT NULL`
- `client_name TEXT NOT NULL`
- `auth_status TEXT NOT NULL`
- `opened_at TEXT NOT NULL`
- `closed_at TEXT`
- `close_code INTEGER`
- `last_seen_at TEXT`
- `metadata_json TEXT`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `CHECK (client_type IN ('orchestrator', 'agent', 'human', 'system'))`
- `CHECK (auth_status IN ('pending', 'success', 'failed'))`

Indexes:
- `INDEX connections_channel_idx (channel_id, opened_at)`

### 13.2 `audit_events`
Low-level non-message audit records.

Columns:
- `audit_event_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `task_id TEXT`
- `channel_id TEXT`
- `connection_id TEXT`
- `trace_id TEXT`
- `event_type TEXT NOT NULL`
- `actor_type TEXT`
- `actor_id TEXT`
- `details_json TEXT`
- `created_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (project_id) REFERENCES projects(project_id)`
- `FOREIGN KEY (task_id) REFERENCES tasks(task_id)`
- `FOREIGN KEY (channel_id) REFERENCES channels(channel_id)`
- `FOREIGN KEY (connection_id) REFERENCES connections(connection_id)`
- `FOREIGN KEY (trace_id) REFERENCES traces(trace_id)`

Indexes:
- `INDEX audit_events_task_idx (task_id, created_at)`
- `INDEX audit_events_channel_idx (channel_id, created_at)`

## 14. Search and Performance Notes
- Enable WAL mode
- Enable foreign keys
- Consider `FTS5` virtual table for message/task search later
- Keep `payload_json` / `metadata_json` small and structured
- Add archival or summarization strategy before message volume gets large
 - Treat `session_checkpoints` and `limit_events` as core operability data, not optional debug metadata

## 15. Suggested Migration Order
1. `projects`
2. `project_settings`
3. `users`
4. `tasks`
5. `task_labels`
6. `task_events`
7. `channels`
8. `channel_members`
9. `sessions`
10. `session_items`
11. `session_checkpoints`
12. `traces`
13. `spans`
14. `handoffs`
15. `guardrail_events`
16. `usage_records`
17. `usage_rollups`
18. `limit_events`
19. `messages`
20. `message_mentions`
21. `connections`
22. `audit_events`

## 16. MVP Notes
- This schema is intentionally broader than the first implementation slice
- MVP can start by creating only the tables needed for setup, tasks, channels, messages, users, and basic audit
- Sessions, traces, guardrails, handoffs, and usage accounting should still be represented in the schema from the beginning so the data model does not need a structural rewrite later
- Session checkpoints and limit events should also exist from the beginning so long-running orchestration can be resumed and debugged safely
