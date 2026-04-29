# DroidSwarm Skills

Dynamic skill packs live under `skills/` and are registered into the global DroidSwarm registry at startup or when `DROIDSWARM_ENABLE_SKILL_WATCH=1` is enabled.

## Skill Pack Layout

Each skill pack uses a lightweight self-contained directory:

- `skills/<name>/SKILL.md`: human-readable instructions consumed by orchestrator workers
- `skills/<name>/manifest.json`: registry manifest with capabilities, required backends, and Droidspeak verbs
- `skills/<name>/index.ts`: optional implementation marker or helper exports
- `skills/<name>/index.spec.ts`: minimal smoke test stub

## CLI Flow

Create a new skill:

```bash
DroidSwarm skill create vision --template research
```

Validate and register it:

```bash
DroidSwarm skill build vision
```

List current skills:

```bash
DroidSwarm skill list
```

Create a specialized agent that loads registered skills:

```bash
DroidSwarm agent create vision-agent --skills vision,reviewer --priority high
```

Run the dedicated code review agent:

```bash
DroidSwarm review run feature/my-branch
```

Start a persistent Ralph worker for long-horizon refinement:

```bash
DroidSwarm ralph start "polish the release candidate until <RALPH_DONE>"
DroidSwarm ralph status
```

The built-in `code-review-agent` skill is registered from `skills/code-review-agent/` and exposes:

- PR description validation
- diff-aware bug finding with line references
- test coverage gap detection
- security and performance heuristics
- categorized markdown review output
- consensus-aware audit records when critical paths are touched

The built-in `ralph-wiggum-worker` skill is registered from `skills/ralph-wiggum-worker/` and exposes:

- persistent iterative refinement with fresh context windows
- external long-term-memory recall on every pass
- governed pause, halt, and completion semantics
- Droidspeak `RALPH_ITERATION`, `RALPH_DONE`, and `RALPH_PAUSE` events

## Governed Evolution

Hermes-style skill evolution is available through the shared registry and remains human-gated.

Generate or inspect proposals:

```bash
DroidSwarm evolve status
DroidSwarm evolve propose --target-skill code-review-agent
```

Approve a reflected proposal:

```bash
DroidSwarm evolve approve <proposal-id>
```

Slack mirrors the same flow with `/droid evolve status`, `/droid evolve run [skill]`, and `/droid skill approve <proposal-id>`. The dashboard exposes an “Evolution Proposals” panel for proposal approval and stub inspection.

When `DROIDSWARM_ENABLE_HERMES_LOOP=true`, the orchestrator periodically reflects on procedural memory, stores new pattern memories, and proposes governed skill changes through the same registry.

## Governance

- Skills and specialized agents that mark `affectsCoreBehavior: true` enter the registry as `pending-approval`.
- Operators can approve them through `DroidSwarm skill approve <name>`, `DroidSwarm agent approve <name>`, Slack, or the dashboard.
- Reflection-generated skill proposals also require explicit human approval before their scaffolded files become active runtime skills.
- Skills must declare valid Droidspeak verbs in `manifest.json` before they can contribute to the runtime catalog.
- Review automation can be triggered from CLI, Slack (`/droid review <pr-id>`), the dashboard “Code Reviews” panel, or automatically after PR automation pushes a branch.
