DroidSwarm Governance & Adaptive Laws Plan
For Codex Agent Execution
Objective
Add a complete Asolaria-inspired governance system to DroidSwarm with:

Clearly numbered, versioned Laws (modeled on LAW-001 and Brown-Hilbert.md).
Built-in multi-agent debate, reasoning, and checks & balances.
Adaptive rule system that allows agents/orchestrators to propose new laws or modifications, debate them internally, and only apply them after explicit human (admin) approval.

The system must remain fully compliant with all existing laws at all times, and new rules must be auditable via shared-tracing.
Current State (Codebase Evaluation)

SYSTEM_CANON.md and AGENTS.md contain basic agent rules and git-flow enforcement.
No dedicated shared-laws / shared-governance package.
No Brown-Hilbert.md equivalent, numbered LAW manifest, or formal debate engine.
Orchestrator already performs verification/review steps, but lacks structured multi-agent debate or adaptive rule proposal flow.
EnvelopeV2, Droidspeak, federation bus, and shared-tracing are in place and will be leveraged for governance messages.

Phase 0: Core Governance Package

Create new Nx library: packages/shared-governance.
Add:
laws-manifest.ts — central LAW registry (LAW-001 through LAW-999) with version, description, Droidspeak glyph mapping, and enforcement function.
brown-hilbert.md — new root-level file mirroring Asolaria’s Brown-Hilbert glyph system (dimensional axes, glyph vocabulary, reasoning primitives).
SYSTEM_LAWS.md — human-readable, numbered laws document (start with LAW-001: Droidspeak mandatory, LAW-002: tamper-evident audit required, etc.).

Export enforceLaw(lawId: string, context: any) and validateCompliance() helpers.

Phase 1: LAW Enforcement Layer

Extend shared-droidspeak catalogs with governance verbs (EVT-LAW-PROPOSAL, EVT-DEBATE-ROUND, EVT-VOTE, EVT-HUMAN-APPROVAL).
Update every critical boundary (orchestrator inbound, federation bus, worker-host, Slack bot, dashboard) to call enforceLaw() on every message/action.
Add immune-governance-supervisor (new supervisor in orchestrator) that runs periodic compliance checks and broadcasts LAW hash for drift detection.

Phase 2: Debate & Reasoning Engine

Create packages/shared-governance/src/debate-engine.ts:
Multi-round debate protocol using model-router (prefer Apple Intelligence on Mac).
Structured debate flow: Proposal → Round 1 (arguments for/against) → Round 2 (rebuttals) → Final consensus vote.
Each round logged as Droidspeak + full English translation in shared-tracing.

Integrate checks & balances:
At least 3 independent agents (planner, reviewer, verifier) must participate.
Quorum voting with veto rights for designated “guardian” agents.
Automatic rejection if any LAW violation is detected during debate.

Hook into orchestrator: any internal decision that could affect system behavior triggers a lightweight debate round.

Phase 3: Adaptive Rule System

Add proposal flow in debate-engine:
Agents can emit EVT-LAW-PROPOSAL (with new LAW text, rationale, Droidspeak glyph).
Full debate round is automatically scheduled.
Outcome is either “Rejected” or “Pending Human Approval”.

Human approval interface:
Slack bot command: /droid law propose and /droid law approve <proposal-id>.
Dashboard tab “Governance → Pending Proposals” with approve/reject buttons.
Approval requires explicit admin confirmation + optional comment.

On approval:
Auto-append new LAW to SYSTEM_LAWS.md and laws-manifest.
Commit the change to the central DroidSwarm repo (controlled git operation).
Broadcast LAW-UPDATE to all federated slaves via federation bus.
Trigger self-restart of affected services to load the new rule.


Phase 4: Integration & Polish

Update:
Master orchestrator and all slaves to load shared-governance on startup.
Federation slave onboarding to include full LAW manifest sync and compliance verification.
Droidspeak translator and shared-tracing to treat governance events specially (always store both glyph and English).
Slack bot and dashboard to surface governance status, active debates, and LAW list.

Add CLI commands:
DroidSwarm laws list
DroidSwarm laws status
DroidSwarm laws propose (for manual human-initiated proposals)


Phase 5: Testing & Validation

Unit tests for law enforcement and debate round simulation.
Integration tests: agent proposes a new rule → debate occurs → human approves via Slack → rule is added and enforced everywhere.
Compliance test: attempt to violate a LAW → must be blocked and audited.
Federation test: onboard a slave → verify it receives and enforces the full LAW set.
End-to-end: multi-project scenario with a governance proposal that affects all projects.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
governance: Phase X - [short description]
Reuse existing packages (shared-droidspeak, shared-tracing, federation-bus, model-router, orchestrator) wherever possible.
Keep all governance features modular and behind an optional flag (--enable-governance, default: true once complete).
Ensure everything remains Mac-friendly, local-first, and fully auditable.
After completion, update SYSTEM_LAWS.md, AGENTS.md, and all relevant documentation with the new governance framework.

This plan gives DroidSwarm the same formal, self-regulating governance that makes Asolaria robust while adding human-in-the-loop adaptation and clear checks & balances. All internal reasoning stays in Droidspeak; user-facing interfaces remain natural English.

Completion Status

Status: Implemented in repo on April 24, 2026

Completed implementation summary

- Phase 0: added `packages/shared-governance` with the canonical law manifest, compliance helpers, proposal store, debate engine, CLI, and unit coverage. Root governance documents now live in `SYSTEM_LAWS.md` and `Brown-Hilbert.md`.
- Phase 1: governance verbs were added to `packages/shared-droidspeak`, and law enforcement now gates critical boundaries in the orchestrator, socket server, worker host, Slack bot, dashboard operator API, and federation onboarding flow.
- Phase 2: `apps/orchestrator/src/services/governance-supervisor.service.ts` now performs periodic compliance checks and audit emission. The debate engine enforces planner/reviewer/verifier quorum plus guardian veto handling before proposals can advance.
- Phase 3: adaptive rule proposal flows now exist across CLI, Slack, and dashboard surfaces. Approved proposals persist in the governance store, update the active runtime law set, and append to `SYSTEM_LAWS.md`.
- Phase 4: governance is loaded at startup behind `DROIDSWARM_ENABLE_GOVERNANCE` / `DroidSwarm swarm --no-governance`. Federation slave onboarding now includes law hash and manifest sync, and the dashboard board exposes governance status plus proposal controls.
- Phase 5: unit and integration coverage now verifies law enforcement, debate simulation, Slack proposal approval, and governance-aware boundary enforcement across the touched services.

Verification run

- `npx nx typecheck shared-governance`
- `npx nx typecheck slack-bot`
- `npx nx typecheck dashboard`
- `npx nx typecheck orchestrator`
- `npx nx typecheck socket-server`
- `npx nx typecheck worker-host`
- `npx nx typecheck federation-bus`
- `npx nx test shared-governance`
- `npx nx test slack-bot`
- `npx nx test socket-server`
- `npx nx test orchestrator`
- `bash -n packages/bootstrap/bin/DroidSwarm`
- `bash -n packages/bootstrap/libexec/droidswarm-daemon.sh`
- `bash -n packages/bootstrap/scripts/install-droidswarm.sh`

Implementation notes

- Governance enforcement is enabled by default, but remains runtime-switchable so existing local installs can still boot with `--no-governance` when needed.
- Approved runtime laws are enforced immediately from the governance store and documented in `SYSTEM_LAWS.md`; code generation of new enforcement logic is intentionally not automatic.
- The dashboard exposes governance proposal actions through server routes, while Slack and CLI provide equivalent human approval paths for operator workflows.
