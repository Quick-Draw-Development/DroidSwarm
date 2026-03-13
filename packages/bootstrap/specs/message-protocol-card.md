# Message Protocol Card

Canonical communication protocol for orchestrator, agents, and human-facing system events. This protocol is designed to optimize agent coordination by using compact typed JSON messages instead of relying on plain English.

## 1. Purpose & Scope
- Make agent communication machine-readable, concise, and auditable
- Allow orchestrator routing and workflow transitions without parsing prose
- Keep natural-language content optional and secondary to structured fields
- Support the WebSocket server, orchestrator, and dashboard with one shared protocol model

## 2. Design Rules
- Every message uses a typed JSON envelope
- Prefer codes, IDs, enums, and references over freeform English
- Use natural language only when needed for:
  - human clarification
  - short reasoning summaries
  - proposal explanation
  - artifact description
- Controlled shorthand may be used for compressed agent summaries only when it is governed by a named scheme
- Do not require downstream components to infer workflow state from prose

## 3. Common Envelope

All messages should include:

```json
{
  "message_id": "uuid",
  "project_id": "project-id",
  "room_id": "uuid",
  "task_id": "uuid",
  "type": "status_update",
  "from": {
    "actor_type": "agent",
    "actor_id": "uuid",
    "actor_name": "Planner-Alpha"
  },
  "timestamp": "2026-03-12T15:04:05Z",
  "payload": {}
}
```

Required fields:
- `message_id`
- `project_id`
- `room_id`
- `type`
- `from`
- `timestamp`
- `payload`

Optional fields:
- `task_id`
- `reply_to`
- `trace_id`
- `span_id`
- `session_id`
- `usage`
- `compression`

## 4. Payload Principles
- Use small, typed fields
- Prefer references to large content
- Use `reason_code` instead of embedding explanations in prose
- Use `content` only when a human-readable explanation is genuinely useful
- Use `metadata` only for flexible non-core fields
- Use structured `usage` objects for token accounting instead of embedding usage summaries in prose
- Use structured compression metadata when controlled shorthand is present
- Use explicit limit/checkpoint events instead of inferring throttling or rollover from chat text

### 4.2 Compression Object
When compressed shorthand is used, it should follow a consistent shape:

```json
{
  "compression": {
    "scheme": "droidspeak-v1",
    "compressed_content": "blk api-spec; need be impl path+schema; dep ui-auth"
  }
}
```

Rules:
- `compressed_content` is optional shorthand, never the canonical source of task state
- Supported shorthand must be reversible enough for frontend translation
- Structured payload fields remain authoritative even when compressed shorthand is present
- `droidspeak-v1` vocabulary and grammar are defined separately in the Droidspeak Card

### 4.1 Usage Object
When usage is available, it should follow a consistent shape:

```json
{
  "usage": {
    "total_tokens": 3513847,
    "input_tokens": 3270369,
    "cached_input_tokens": 45662848,
    "output_tokens": 243478,
    "reasoning_output_tokens": 117436
  }
}
```

## 5. Core Message Types

### 5.1 `auth`
First message on connection.

Payload:
- `agent_name`
- `agent_role`
- `token` (optional except for privileged rooms)

### 5.2 `status_update`
Small operational updates.

Payload:
- `status_code`
- `phase`
- `content` (optional)
- `compression` (optional)
- `metadata` (optional)

Examples of `status_code`:
- `ready`
- `working`
- `blocked`
- `waiting_on_human`
- `waiting_on_agent`
- `complete`

### 5.3 `request_help`
Ask orchestrator for another agent or capability.

Payload:
- `needed_role`
- `reason_code`
- `context_ref`
- `priority`
- `content` (optional)
- `compression` (optional)

### 5.4 `handoff_event`
Explicit delegation from one actor to another.

Payload:
- `handoff_id`
- `to_actor_type`
- `to_actor_id` (optional when requesting a role rather than a specific actor)
- `to_role` (optional)
- `reason_code`
- `context_ref`
- `expected_outcome`
- `content` (optional)
- `compression` (optional)

### 5.5 `guardrail_event`
Guardrail pass/fail/tripwire result.

Payload:
- `guardrail_name`
- `phase`
- `result`
- `details`
- `content` (optional)

### 5.6 `trace_event`
Trace/span lifecycle message when surfaced over the socket.

Payload:
- `trace_id`
- `span_id`
- `event_name`
- `status`
- `metadata` (optional)
- `usage` (optional)

### 5.6.1 `usage_event`
Structured usage accounting message.

Payload:
- `usage_scope`
- `run_id`
- `agent_id`
- `model_name` (optional)
- `tool_name` (optional)
- `total_tokens`
- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `content` (optional)

### 5.6.2 `limit_event`
Structured rate-limit, budget, or context-pressure message.

Payload:
- `limit_event_id`
- `limit_type`
- `scope_type`
- `scope_id`
- `status`
- `threshold_name` (optional)
- `current_value` (optional)
- `threshold_value` (optional)
- `retry_after_ms` (optional)
- `degraded_mode` (optional)
- `content` (optional)

Allowed `limit_type` values:
- `rate_limit`
- `token_budget`
- `context_window`
- `concurrency`

Allowed `status` values:
- `near_limit`
- `exceeded`
- `backing_off`
- `rolled_over`
- `degraded`
- `recovered`

### 5.6.3 `checkpoint_event`
Structured workflow/session checkpoint message.

Payload:
- `checkpoint_id`
- `session_id`
- `trace_id` (optional)
- `checkpoint_type`
- `summary_ref` (optional)
- `reason_code`
- `content` (optional)

Allowed `checkpoint_type` values:
- `workflow_boundary`
- `context_rollover`
- `pre_restart`
- `manual`

### 5.7 `proposal`
Structured proposal for a plan or decision.

Payload:
- `proposal_id`
- `proposal_type`
- `summary`
- `content` (optional)
- `compression` (optional)
- `artifact_ref` (optional)

### 5.8 `vote`
Structured decision vote.

Payload:
- `proposal_id`
- `vote`
- `reason_code` (optional)
- `content` (optional)

Allowed `vote` values:
- `approve`
- `reject`
- `abstain`

### 5.9 `artifact`
Reference to code, diff, document, or output.

Payload:
- `artifact_id`
- `artifact_type`
- `uri` or `storage_ref`
- `summary`
- `language` (optional)
- `content` (optional, avoid large inline payloads by default)
- `compression` (optional)

### 5.10 `clarification_request`
Question to a human, usually with a mention target.

Payload:
- `question_id`
- `target_user_id`
- `reason_code`
- `question`
- `choices` (optional)
- `metadata` (optional)

### 5.11 `clarification_response`
Human response to a clarification request.

Payload:
- `question_id`
- `response`
- `response_code` (optional)
- `metadata` (optional)

### 5.12 `chat`
Fallback freeform message when structured types are insufficient.

Payload:
- `content`
- `intent_code` (optional)

Rule:
- `chat` is allowed, but should not be the default for operational coordination.

### 5.13 `heartbeat`
Liveness signal.

Payload:
- `status` (optional)

## 6. Recommended Reason Codes

Examples:
- `api_design_blocked`
- `missing_requirements`
- `needs_human_clarification`
- `branch_policy_check`
- `test_failure`
- `review_changes_requested`
- `need_backend_help`
- `need_frontend_help`
- `need_tester_help`

## 7. Optimization Rules
- Keep agent-to-agent operational messages under a small payload budget where practical
- Prefer one structured event over multiple conversational back-and-forth messages
- Link to context with `context_ref`, `session_id`, `trace_id`, `artifact_id`, or `proposal_id`
- Avoid duplicating large content already stored elsewhere
- Use controlled shorthand only for compressible summaries, not for exact operational state
- Build active context from checkpoints, durable facts, and recent deltas instead of replaying full transcripts

## 8. Validation Rules
- Validate all message envelopes with Zod
- Reject unknown required fields only when strict mode is enabled
- Reject missing required fields always
- Enforce per-type payload schemas
- Enforce privileged room restrictions for control-plane message types

## 9. Audit Rules
- Persist the raw message envelope
- Persist extracted structured fields for indexing where useful
- Preserve `reason_code`, references, and mentions for downstream analytics and UI
- Preserve compression scheme and raw compressed text whenever shorthand is used
- Preserve usage, limit, and checkpoint metadata for runtime analytics and recovery

## 10. MVP Notes
- Start with a minimal set of core types:
  - `auth`
  - `status_update`
  - `request_help`
  - `handoff_event`
  - `artifact`
  - `clarification_request`
  - `clarification_response`
  - `guardrail_event`
  - `trace_event`
  - `usage_event`
  - `limit_event`
  - `checkpoint_event`
  - `heartbeat`
- Keep `chat`, `proposal`, and `vote` available, but do not let them become the default replacement for structured coordination
- Support `droidspeak-v1` only as an optional compressed summary layer in MVP, with a frontend translator and raw-view toggle
