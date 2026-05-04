# DroidSwarm Memory

DroidSwarm now has two complementary memory surfaces:

- Shared long-term memory in `shared-memory`, exposed through `DroidSwarm memory ...`
- A portable project-local `.agent/` brain, exposed through `DroidSwarm brain ...`

## Portable Agent Brain

When `DROIDSWARM_ENABLE_AGENTIC_BRAIN=true`, project onboarding creates a `.agent/` folder at the project root. Global brains may instead live under `~/.droidswarm/global.agent/`.

The managed layout is:

```text
.agent/
├── AGENTS.md
├── harness/
├── memory/
│   ├── working/
│   ├── episodic/
│   ├── semantic/
│   └── personal/
├── skills/
├── protocols/
└── tools/
```

The memory layers have distinct roles:

- `working`: volatile short-term notes and task-local state
- `episodic`: chronological action logs and recent outcomes
- `semantic`: promoted lessons and durable abstractions rendered into `LESSONS.md`
- `personal`: operator preferences and personal toggles

## Search And Promotion

`DroidSwarm memory search <query>` continues to query long-term memory. When the agentic brain is enabled, retrieval also searches the `.agent/` memory layers using FTS5 where available, then `rg`, then `grep`.

Dream cycles are mechanical clustering passes over recent episodic memory. They stage candidates in `.agent/memory/review_state.jsonl` and do not self-promote lessons.

Promotion remains human-reviewed:

```bash
DroidSwarm memory list-candidates
DroidSwarm memory graduate <candidate-id> --rationale "..."
DroidSwarm memory reject <candidate-id> --reason "..."
DroidSwarm memory reopen <candidate-id> --rationale "..."
DroidSwarm brain status
DroidSwarm brain dream
```

Slack and the dashboard expose the same candidate-review and dream-cycle flows.

## Skills And Rewrite Signals

The `.agent/skills/` directory keeps a manifest-first disclosure index and usage ledger. Workers record skill outcomes there so repeated failures can stage governed rewrite proposals. Proposed rewrites remain inactive until a human approves them.

## Governance

- Brain layout creation, dream cycles, memory promotion, and review actions emit tamper-evident audit events.
- Dream cycles and rewrite staging remain optional and gated behind `DROIDSWARM_ENABLE_AGENTIC_BRAIN=true`.
- Human review is mandatory before promoted lessons or rewritten skills become active runtime inputs.
