DroidSwarm agentic-stack Integration Plan
For Codex Agent Execution
Objective
Incorporate the six high-value features from agentic-stack into DroidSwarm as native, first-class capabilities:

Portable .agent/ brain folder (memory + skills + protocols)
4-layer memory hierarchy (working / episodic / semantic / personal)
auto_dream nightly cycle + pattern clustering
Progressive skill disclosure
Self-rewriting skills + usage-pattern hooks
FTS5-based memory search (with ripgrep/grep fallback) + human-reviewed memory promotion protocol

These will be built on top of our existing shared-memory, shared-skills, shared-governance, shared-tracing, model-router, Ralph workers, and federation systems. The result is a dramatically more mature, portable, and self-improving memory/skill layer while preserving Droidspeak, tamper-evident audit, governance, and federation invariants.
Key Principles

All new memory and skill operations remain Droidspeak-only internally.
Every promotion, rewrite, or dream cycle is logged to shared-tracing.
Human-in-the-loop is mandatory for memory promotion and skill rewrites (via governance consensus + Slack/dashboard).
The .agent/ folder is per-project by default but can be marked global.
Fully federation-aware: slaves sync memory/skills and can run dream cycles.
Backward-compatible and optional (behind DROIDSWARM_ENABLE_AGENTIC_BRAIN=true).

Phase 0: Portable .agent/ Brain Folder (Foundation)

Create packages/shared-agent-brain (new Nx library).
Add a standardized .agent/ directory layout at project root (or ~/.droidswarm/global.agent/ for global brain):text.agent/
├── AGENTS.md                  # root map (auto-generated)
├── harness/                   # DroidSwarm-specific hooks
├── memory/                    # 4-layer structure (see Phase 1)
├── skills/                    # manifest + SKILL.md files
├── protocols/                 # permissions + delegation rules
└── tools/                     # CLI helpers (learn, recall, show, etc.)
Extend shared-persistence and project onboarding to automatically create and version .agent/ on DroidSwarm project onboard.
Update bootstrap and installer to provision the folder structure.

Phase 1: 4-Layer Memory Hierarchy + FTS5 Search

In shared-agent-brain/memory/ implement the exact 4-layer structure:
working/ – volatile short-term (in-memory + SQLite temp)
episodic/ – chronological action logs (EnvelopeV2 + outcome)
semantic/ – clustered lessons (lessons.jsonl + rendered LESSONS.md)
personal/ – PREFERENCES.md + user toggles

Add memory-store.ts and memory-retrieval.ts with 4-layer abstraction.
Implement FTS5 search (memory_search.ts) using better-sqlite3 FTS5:
Index all .md and .jsonl files in memory layers.
CLI: DroidSwarm memory search "query"
Fallback to ripgrep/grep when FTS5 is disabled.

Hook retrieval into model-router and Ralph workers (inject top-K relevant memories).

Phase 2: auto_dream Nightly Cycle + Human-Reviewed Promotion

Add memory/auto_dream.ts (runs via orchestrator scheduler or cron):
Calls cluster.py equivalent (TypeScript clustering of recent episodic memory).
Stages candidates in memory/review_state.jsonl.
Performs mechanical operations only (no LLM reasoning during dream).

Implement human-reviewed promotion:
CLI tools: DroidSwarm memory list-candidates, graduate <id> --rationale "…", reject <id> --reason "…", reopen <id>.
Slack commands: /droid memory review, /droid memory graduate <id>.
Every promotion/rejection requires rationale and triggers lightweight consensus (Reviewer + Guardian roles).

On approval, move lessons to semantic/ and re-render LESSONS.md.

Phase 3: Progressive Skill Disclosure

In shared-skills add _manifest.jsonl + _index.md at skills/ root.
On agent startup or skill lookup:
Load only the lightweight manifest first.
Load full SKILL.md only when a trigger phrase or task keyword matches.

Update skill registry and model-router to respect progressive disclosure rules.
Extend Droidspeak with verbs for skill discovery (SKILL_DISCOVER, SKILL_LOAD).

Phase 4: Self-Rewriting Skills + Usage-Pattern Hooks

Add to every skill manifest: selfRewriteHooks array (failure patterns, rewrite triggers).
Extend on_failure hook in worker-host:
After 3+ failures in 14 days, flag skill for rewrite.
Trigger Ralph worker or reflection engine to propose updated skill code.

Proposed rewrite goes through governance consensus + human approval (via graduate flow).
On approval, auto-build and hot-reload the skill (federation broadcast to slaves).

Phase 5: Full Integration, UI, Governance & Polish

Hook everything into existing systems:
Orchestrator & Ralph workers automatically query 4-layer memory.
Governance: any dream cycle or skill rewrite triggers consensus.
Tracing: all promotions, rewrites, and dream operations are audited.
Federation: slaves sync .agent/ changes and can run local dream cycles.

Update UI/CLI:
Slack: /droid memory *, /droid skill *, /droid dream run.
Dashboard: new “Brain” tab showing memory layers, candidates, skill manifests.
CLI: DroidSwarm brain status, DroidSwarm brain dream, etc.

Add AGENTS.md auto-generation from current swarm state.

Phase 6: Testing & Validation

Unit tests for each memory layer, FTS5 search, dream clustering, and promotion flow.
Integration tests: simulate repeated failures → self-rewrite proposal → human approval → skill updated and used.
End-to-end: multi-session task across projects → verify memory recall and progressive disclosure.
Federation test: memory/skills updated on master → slaves receive and use updated brain.
Governance test: dream cycle and skill rewrite go through consensus and are fully traced.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
agentic-brain: Phase X - [short description]
Reuse existing packages (shared-memory, shared-skills, shared-governance, shared-tracing, model-router, federation-bus, orchestrator, Ralph worker, Slack bot, dashboard) wherever possible.
Keep all new features modular and behind the DROIDSWARM_ENABLE_AGENTIC_BRAIN flag.
Ensure everything remains Mac-friendly, local-first, secure, and compliant with all laws.
After completion, update SYSTEM_LAWS.md, SKILLS.md, AGENTS.md, and MEMORY.md with full documentation of the new agentic brain system.

This plan transforms DroidSwarm’s memory and skill system into a production-grade, portable, self-improving brain that directly inherits the best ideas from agentic-stack while staying tightly integrated with our federation, Droidspeak, governance, and persistent worker architecture.
Start with Phase 0.

## Completion

Completed on 2026-05-04.

Implemented:

- New `packages/shared-agent-brain` Nx library with managed `.agent/` layout creation, portable memory layers, FTS5-backed search with `rg`/`grep` fallback, dream-cycle staging, progressive skill disclosure indexes, and usage-pattern rewrite detection.
- Automatic `.agent/` provisioning during project onboarding plus shared-memory mirroring so durable memory writes also populate the portable brain when applicable.
- Human-reviewed promotion flow for `.agent` memory candidates through CLI, Slack, and dashboard surfaces, with semantic lesson rendering into `LESSONS.md`.
- Progressive skill disclosure and self-rewrite hooks wired into the shared skills registry and worker outcome tracking.
- Optional orchestrator dream-loop scheduling and governed skill-rewrite proposal staging behind `DROIDSWARM_ENABLE_AGENTIC_BRAIN=true`.
- Dashboard Brain panel, `/api/brain` route, Slack `brain` and `memory` commands, and `DroidSwarm brain ...` / expanded `DroidSwarm memory ...` CLI flows.
- Documentation updates in `SYSTEM_LAWS.md`, `SKILLS.md`, `AGENTS.md`, and the new `MEMORY.md`.

Validation completed with:

- `npx nx typecheck shared-agent-brain shared-memory shared-skills shared-projects orchestrator slack-bot dashboard`
- `npx nx test shared-agent-brain shared-memory shared-skills shared-projects orchestrator slack-bot`
- `bash -n packages/bootstrap/bin/DroidSwarm`
