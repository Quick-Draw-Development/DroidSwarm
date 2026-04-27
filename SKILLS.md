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

## Governance

- Skills and specialized agents that mark `affectsCoreBehavior: true` enter the registry as `pending-approval`.
- Operators can approve them through `DroidSwarm skill approve <name>`, `DroidSwarm agent approve <name>`, Slack, or the dashboard.
- Skills must declare valid Droidspeak verbs in `manifest.json` before they can contribute to the runtime catalog.
