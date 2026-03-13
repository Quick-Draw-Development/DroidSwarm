# Droidspeak Card

Controlled shorthand specification for compressed agent summaries. `droidspeak-v1` is optional and exists to reduce token usage for agent-to-agent reasoning summaries while remaining reversible enough for frontend translation and audit review.

## 1. Purpose & Scope
- Provide a compact shorthand for agent summary text
- Reduce token usage for repeated operational reasoning patterns
- Preserve readability through deterministic translation rules
- Never replace canonical structured protocol fields

## 2. Non-Goals
- Do not use `droidspeak-v1` as the primary source of workflow state
- Do not use it for auth, branch policy, guardrail enforcement, or any field that must be exact
- Do not use it for human clarification prompts or responses
- Do not allow ad hoc invented shorthand outside the defined vocabulary and grammar

## 3. Allowed Use Cases
- Blocked-state summaries
- Handoff summaries
- Request-help summaries
- Proposal summaries
- Artifact summaries
- Short trace or progress summaries

## 4. Disallowed Use Cases
- Control-plane operator messages
- Canonical `reason_code` fields
- Structured IDs, branch names, or task IDs
- Human-facing final explanations without translation

## 5. Format Rules
- Lowercase ASCII only
- Tokens separated by spaces
- Clauses separated by `;`
- Key/value relation expressed as `key:value`
- Compound dependency relation may use `+`
- Prefer known abbreviations over full words
- Avoid punctuation other than `:`, `;`, `+`, `-`, `/`, and `_` when needed for references

Example:

```text
blk api-spec; need be impl path+schema; dep ui-auth
```

## 6. Grammar

Recommended clause pattern:

```text
<state> <subject>; <action> <target> <qualifier>; <relation> <ref>
```

Supported clause starters:
- `st`
- `ctx`
- `blk`
- `need`
- `do`
- `done`
- `dep`
- `ask`
- `vote`
- `err`
- `risk`
- `next`

Examples:
- `blk api-spec; need be impl path+schema`
- `need fe help; dep api-auth`
- `done test pass; next pr-prep`
- `risk branch-pol; ask orch`

## 7. Core Vocabulary

### 7.1 State Terms
- `st` = state
- `blk` = blocked
- `done` = complete
- `prog` = in progress
- `wait` = waiting
- `risk` = risk detected
- `err` = error
- `ok` = validated / healthy

### 7.2 Action Terms
- `need` = need / requires
- `do` = perform / execute
- `ask` = ask / request
- `chk` = check / validate
- `impl` = implement
- `spec` = specification
- `prep` = prepare
- `merge` = merge
- `test` = test
- `fix` = fix
- `plan` = plan

### 7.3 Actor / Role Terms
- `orch` = orchestrator
- `hum` = human
- `fe` = frontend agent / frontend work
- `be` = backend agent / backend work
- `qa` = tester / qa
- `arch` = architect
- `planr` = planner
- `crit` = critic

### 7.4 Artifact / Domain Terms
- `api` = api
- `ui` = ui
- `db` = database
- `auth` = authentication
- `schema` = schema
- `path` = endpoint/path
- `pr` = pull request
- `diff` = diff
- `ctx` = context
- `sess` = session
- `trace` = trace

### 7.5 Relation Terms
- `dep` = depends on
- `next` = next step
- `via` = through
- `for` = for
- `re` = regarding

## 8. Reference Rules
- Keep canonical IDs outside the compressed string when possible
- Prefer references like `ctx_ref`, `task_id`, `artifact_id`, and `session_id` in structured fields
- If an identifier must appear in shorthand, use a short stable alias already present in structured payload metadata

## 9. Clause Templates
- `state clause`: `st <subject> <description>` (e.g., `st ui flow reviewed`)
- `blocked clause`: `blk <subject>; need <role> <rationale>; dep <ref>` (e.g., `blk api-spec; need be impl path+schema; dep ui-auth`)
- `needs clause`: `need <role> <deliverable> <context>` (e.g., `need qa test coverage`, `need fe review spec`)
- `next clause`: `next <action> <target>` (e.g., `next pr-prep`, `next merge production`)
- `done clause`: `done <activity> <result>` (e.g., `done design review`, `done tests pass`)
- `risk clause`: `risk <area> <severity>; ask hum validate` (e.g., `risk release timing; ask hum verify`)

Keep `compressed_content` to 2-4 clauses per summary and avoid newline characters. Clause order should follow the story arc: state → action → dependency/next.

## 10. Translation Helpers
- Template (`blk` clause): `Blocked on {subject}; needs {role} to {action}; depends on {ref}.`
- Template (`need` clause): `{Role} needs to {action} {target}.`
- Template (`next` clause): `Next step: {action} {target}.`
- Template (`done` clause): `{Activity} done ({result}).`
- Template (`risk` clause): `Risk: {area} ({severity}). Prompting {audience} for verification.`

Unknown tokens must render verbatim and be tagged as “untranslated” in the UI.

## 11. Agent Responsibilities
- Every Codex agent must set `compression.scheme = droidspeak-v1` when emitting summaries, status updates, handoffs, or help requests.
- Mirror the compressed text in telemetry usage records so analytics can audit token savings and errors.
- Droidspeak must augment, not replace, structured fields such as `reason_code`, `clarification_question`, `doc_updates`, or `branch_actions`.
- When requesting another agent, provide the latest clause as `parentDroidspeak` so successors continue the narrative.

## 12. Orchestrator Conventions
- The orchestrator validates each Droidspeak string for dictionary compliance and clause limits before routing the summary downstream.
- Operator instructions remain plain language; once acted on, the orchestrator emits a Droidspeak summary of the resulting decision.
- The dashboard UI should render both raw `compressed_content` and its deterministic translation so humans can toggle between them.

## 13. Translation Rules
- The frontend translator should map each known token to readable English
- The frontend translator should use a small set of deterministic grammar templates layered on top of the token dictionary
- Unknown tokens should be rendered verbatim and flagged as untranslated
- Translation should preserve clause boundaries from `;`
- Users should be able to toggle:
  - translated view
  - raw `droidspeak-v1` view

### 13.1 Translation Strategy
- Step 1: tokenize the shorthand string by clauses and tokens
- Step 2: map known tokens through the `droidspeak-v1` dictionary
- Step 3: apply a small template set based on clause starters such as `blk`, `need`, `dep`, `next`, `done`, and `risk`
- Step 4: render unknown tokens verbatim rather than guessing

This translation must remain deterministic and local to the frontend. It should not require another model call.

Example translation:

```text
blk api-spec; need be impl path+schema; dep ui-auth
```

becomes:

```text
Blocked on API specification; backend implementation needs path and schema; depends on UI auth.
```

## 14. Authoring Rules for Agents
- Keep summaries short
- Use at most 2–4 clauses for MVP
- Use defined tokens only
- Do not omit critical structured fields assuming shorthand will carry them
- If shorthand becomes awkward, use normal optional `content` instead

## 15. Validation Rules
- `compression.scheme` must equal `droidspeak-v1`
- `compressed_content` must be lowercase ASCII
- Reject shorthand strings that exceed a conservative length limit in MVP
- Reject unsupported punctuation patterns
- Optionally lint tokens against the known vocabulary list

## 16. MVP Notes
- Start with a small vocabulary and expand only when repeated patterns justify it
- Log both translated and raw forms only if translation is deterministic; otherwise log raw plus renderer version
- Treat `droidspeak-v1` as a token-saving aid, not as a hidden internal language
