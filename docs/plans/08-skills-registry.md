DroidSwarm Dynamic Skills & Specialized Agent Builder Plan
For Codex Agent Execution
Objective
Add a clean, extensible system for easily creating and onboarding new skills (reusable capabilities) and specialized agents (dedicated worker types) so they are automatically discovered, registered, and picked up by the orchestrator, worker-host, federation bus, model-router, Droidspeak translator, governance layer, and all slaves — with zero or minimal manual restarts.
This turns DroidSwarm into a truly pluggable swarm where new capabilities can be added at runtime or via simple CLI commands while maintaining full compliance with laws, Droidspeak, tracing, and federation rules.
Key Principles

Skills live in skills/ as self-contained Nx libraries.
Specialized agents are config-driven (no code changes to orchestrator core).
Automatic discovery on startup + hot-reload support for running swarms.
New skills/agents must go through optional governance approval (if they affect laws or core behavior).
All internal communication uses Droidspeak; user-facing docs remain English.
Fully federation-aware: new skills are automatically synced to slave nodes.
CLI-first and dashboard/Slack accessible.

Phase 0: Dynamic Skill & Agent Registry

Create packages/shared-skills (new Nx library).
Add:
skill-registry.ts — scans skills/ folder at startup (and on file change via chokidar).
agent-builder.ts — config-driven factory that instantiates specialized agents from JSON/YAML manifests.
skill-manifest.schema.ts — Zod schema for skill definition (name, description, capabilities, required backends, Droidspeak verbs).

Extend global registry.db with skills and agents tables (name, version, hash, status, project-scoped flag).

Phase 1: Skill Creation CLI & Scaffolding

Add CLI commands in packages/bootstrap:
DroidSwarm skill create <name> [--template <basic|research|code|review|custom>]
DroidSwarm skill list
DroidSwarm skill build <name>

Scaffolding template:
Creates new folder under skills/<name> with standard Nx package structure.
Generates index.ts, manifest.json, Droidspeak verb mappings, and test stubs.
Auto-adds to Nx workspace and runs initial build.

Auto-registration: after build, skill-registry immediately picks it up and broadcasts EVT-SKILL-REGISTERED via federation bus.

Phase 2: Specialized Agent Builder

Extend agent-builder.ts to support:
DroidSwarm agent create <name> --skills <skill1,skill2> [--priority <low|medium|high>]
Generates an agent manifest (stored in registry) that defines:
Which skills it loads
Model-router preferences
Governance participation level
Resource quotas


Orchestrator uses the builder to spawn specialized agents on-demand per project or globally.
Worker-host watches the registry and hot-loads new agent types without restarting the entire swarm.

Phase 3: Automatic Pickup & Hot-Reload

Update:
Master orchestrator startup → calls skill-registry.loadAll() and agent-builder.reload().
Federation bus → on slave connection, push latest skill/agent manifests and trigger remote build/install.
Worker-host → listens for EVT-SKILL-REGISTERED and EVT-AGENT-UPDATED events and reloads dynamically.

Add filesystem watcher (chokidar) in shared-skills for live development (optional dev flag).
Slaves automatically pull and build new skills on receipt of manifest updates.

Phase 4: Governance & Safety Integration

Hook new skill/agent creation into shared-governance:
If the skill/agent affects core laws or shared state, trigger a debate round.
Human approval required via Slack (/droid skill approve <name>) or dashboard before activation.

Enforce laws on every new skill:
Must export valid Droidspeak verbs.
Must pass validateCompliance() checks.
All actions logged to shared-tracing with full audit trail.

Add safety gates:
Sandbox for new skill code execution (Firejail / gvisor).
Version pinning and rollback on failure.


Phase 5: Integration & Polish

Update:
Model-router to respect new skill backend requirements.
Droidspeak catalogs to automatically include new verbs from skill manifests.
Dashboard to show “Skills & Agents” tab with add/create buttons and live status.
Slack bot to support /droid skill create, /droid agent create, /droid skills list.

Add documentation:
SKILLS.md and AGENTS.md with templates and examples.
Clear section in SYSTEM_LAWS.md covering skill/agent addition rules.

Provide example templates for common agent types (e.g., “vision-agent”, “math-agent”, “federation-coordinator”).

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
skills-agents: Phase X - [short description]
Reuse existing packages (shared-droidspeak, shared-governance, federation-bus, model-router, shared-tracing, orchestrator, worker-host) wherever possible.
Keep all new features modular and behind optional flags where appropriate.
Ensure everything remains Mac-friendly, local-first, secure, and fully compliant with all existing laws.
After completion, update documentation and provide a working example skill and agent creation flow.

This plan gives DroidSwarm a powerful, self-extending capability layer that feels native to the swarm while staying tightly integrated with governance, federation, and Droidspeak. New skills and agents become first-class citizens that are automatically available across the entire federated system.
Start with Phase 0.

Completion Status

Status: Implemented in repo on April 24, 2026

Completed implementation summary

- Phase 0: `packages/shared-skills` is now a real Nx library with skill and agent manifest schemas, discovery, scaffolding, dynamic registry sync, a specialized-agent builder, a CLI, and test coverage. The global registry DB now has durable `skill_registry` and `agent_registry` tables in `packages/shared-projects`.
- Phase 1: the bootstrap CLI now exposes `DroidSwarm skill ...` and `DroidSwarm agent ...` commands. Skill scaffolding creates `SKILL.md`, `manifest.json`, `index.ts`, and a smoke-test stub under `skills/<name>`.
- Phase 2: specialized agents are config-driven JSON manifests stored under `skills/agents/` and registered durably. The orchestrator skill-pack resolver can now pick up active agent manifests by role/name and expand their backing skill packs automatically.
- Phase 3: orchestrator startup now syncs discovered skills and agents, with optional filesystem watch support behind `DROIDSWARM_ENABLE_SKILL_WATCH`. Federation onboarding now includes dynamic skill/agent manifest snapshots plus the merged Droidspeak verb catalog.
- Phase 4: skill and agent registration paths run through governance-aware compliance checks, can enter `pending-approval`, and can be approved via CLI, Slack, or dashboard. Registry changes are audited through shared tracing.
- Phase 5: the dashboard now exposes a live “Skills & Agents” panel with create/approve controls, Slack supports skills/agent commands, and documentation now lives in `SKILLS.md`, `README.md`, `AGENTS.md`, and `SYSTEM_LAWS.md`.

Verification run

- `npx nx typecheck shared-projects`
- `npx nx typecheck shared-skills`
- `npx nx typecheck orchestrator`
- `npx nx typecheck slack-bot`
- `npx nx typecheck dashboard`
- `npx nx typecheck federation-bus`
- `npx nx typecheck worker-host`
- `npx nx test shared-skills`
- `npx nx test slack-bot`

Implementation notes

- Skills remain lightweight self-contained directories under `skills/` instead of heavy codegen-driven Nx apps; the registry layer treats them as first-class runtime capabilities anyway.
- The `skill build` flow currently validates, syncs, and activates a skill in the registry rather than compiling a standalone package artifact.
- Skill watch/reload is implemented for the orchestrator path and is intended for local development. Worker-host picks up the same registry state on startup rather than maintaining a separate long-lived hot-loader.
