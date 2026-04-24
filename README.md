# DroidSwarm

This repository is an Nx monorepo for a local-first, durable multi-agent system. `apps/orchestrator` remains the canonical control plane, `apps/dashboard` is the primary UI, and `apps/socket-server` is the live messaging gateway.

## Install

From a local checkout:

```bash
./scripts/install-droidswarm.sh
```

From another source checkout or remote repo:

```bash
./scripts/install-droidswarm.sh --repo-url <git-url> --ref main
```

From anywhere (no repo checkout required), you can bootstrap the runtime by curling the installer and running it directly:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Quick-Draw-Development/DroidSwarm/main/scripts/install-droidswarm.sh)"
```

The installer wrapper delegates to the bootstrap package under `packages/bootstrap`. It places runtime state under `~/.droidswarm` by default and installs a `DroidSwarm` command into `~/.local/bin` unless overridden.

If you set `DROIDSWARM_DEFAULT_REPO_URL`, the installer can use that repo as the default source without passing `--repo-url` each time.

## CLI

Set up a project first:

```bash
DroidSwarm setup --project-root "$PWD" --project-mode greenfield
```

For an existing repository, use:

```bash
DroidSwarm setup --project-root "$PWD" --project-mode existing
```

Start a managed swarm:

```bash
DroidSwarm swarm --project-root "$PWD" --env OPENAI_API_KEY=example --config mode=dev
```

Start a managed swarm with optional federation enabled:

```bash
DroidSwarm swarm --project-root "$PWD" --enable-federation --enable-federation-adb
```

Inspect federation status and onboard a peer device:

```bash
DroidSwarm federation status
DroidSwarm federation devices
DroidSwarm federation onboard --swarm-id <id> --serial <adb-serial>
```

If you want a swarm to reuse previously onboarded Android workers automatically, keep the project-level worker registry and pass it explicitly when needed:

```bash
DroidSwarm setup --project-root "$PWD" --project-mode existing --enable-federation --enable-federation-adb
DroidSwarm swarm --project-root "$PWD" --enable-federation --federation-remote-workers-file .droidswarm/federation-workers.json
```

List active swarms:

```bash
DroidSwarm list
```

Remove stopped or failed swarms and their logs:

```bash
DroidSwarm cleanup
```

Remove every tracked swarm, shutting down live ones first:

```bash
DroidSwarm cleanup --all --shutdown-running
```

Repair the local install or do a clean reinstall:

```bash
DroidSwarm repair
DroidSwarm repair --clean
```

Shut down one swarm:

```bash
DroidSwarm shutdown --swarm-id <id>
```

Shut down all swarms:

```bash
DroidSwarm shutdown --all
```

Inspect or manage governance state:

```bash
DroidSwarm laws list
DroidSwarm laws status
DroidSwarm laws propose --title "Require startup governance summaries" --description "Require a startup governance summary in operator-facing surfaces." --rationale "Operators need a visible compliance snapshot at boot."
```

## Current Scope

The repo now carries the shared contracts and persistence scaffolding for multi-project runs, repo-target/workspace scoping, canonical task chat, worker results and heartbeats, project memory, skill packs, local-first routing, EnvelopeV2 compatibility, TaskStateDigest/HandoffPacket durability, and strict git-flow enforcement. Existing durable runs/tasks/checkpoints are preserved and extended rather than replaced.

## Workspace Layout

- `apps/orchestrator`: durable control-plane service that ingests operator/channel events, persists runs/tasks/checkpoints, schedules Codex workers, and feeds the dashboard timeline.
- `apps/dashboard`: Next.js dashboard that reads directly from the orchestrator datastore and now exposes project, task chat, heartbeat, routing, and memory views.
- `apps/socket-server`: live operator/agent gateway that now mirrors canonical task chat records into persistence.
- `apps/worker-host`: optional local worker runtime for adapter-based execution.
- `packages/*`: shared contracts and services for routing, workers, projects, git policy, memory, chat, skills, Codex, llama.cpp, tracing, persistence helpers, and optional federation work.
  - `packages/federation-bus`: optional BEHCS-style peer bus for cross-node EnvelopeV2 relay, heartbeat, kick, signing, and peer status.
  - `packages/federation-adb`: optional Android/ADB discovery and onboarding helpers plus a local ADB supervisor.
- `skills/*`: shared skill packs for orchestrator, planner, researcher, reviewer, bugfix, feature, repo onboarding, and PR review.
- `packages/bootstrap`: install/setup scripts, CLI assets, and system specs.

## Architecture docs

- `docs/orchestrator-architecture.md` describes the final control-plane flow (durable runs/tasks, scheduler decisions, supervisor lifecycle, and the dashboard insights that read them).
- `docs/orchestrator-protocol-migration.md` details EnvelopeV2, compact verbs, TaskStateDigest/HandoffPacket artifacts, and the execution-centered event schema (`plan_proposed`, `verification_requested`, `artifact_created`, etc.) used for compatibility and replay.
- `docs/orchestrator-runlife-guide.md` explains the explicit run lifecycle, dependency semantics, durable event flow, policy enforcement, operator command model, and restart/recovery guarantees that now drive the control plane.
- `docs/architecture/*.md` covers the merged multi-project system, worker contract, chat sync, project registry, routing policy, git policy, and checkpoint memory.

## Testing

- `npx nx test orchestrator` runs the Phase 10 end-to-end coverage (intake → decomposition → scheduling → verification/review → cancellation → restart/resume).
- `npx nx typecheck dashboard` exercises the new insights panel that now surfaces runs, tasks, artifacts, checkpoints, budgets, assignments, verifications, and timeline events from the persistent datastore.
- `npx nx test socket-server` verifies the live gateway persistence and protocol validation paths, including canonical task chat persistence.

## Runtime Setup

The installer now provisions the local runtime stack directly:

- `llama.cpp` is installed locally, then the installer prompts for which local models to download and writes an inventory at `~/.droidswarm/models/inventory.json`.
- Optional federation runtimes are staged into the installed runtime so a swarm can start a local federation bus and ADB supervisor when federation is enabled.
- `DroidSwarm federation onboard` now also registers a reusable Android remote-worker record in `.droidswarm/federation-workers.json`, which the orchestrator can use to launch federated ADB-backed workers on later swarms.

The installer writes the resolved service configuration to `~/.droidswarm/services.env`. Swarm startup reads that file, starts llama.cpp as a managed local service, and exports its local URL plus the selected llama model catalog to the orchestrator. Environment variables remain available as overrides, but they are no longer the primary setup path.

The daemon also writes a machine-readable service health snapshot per swarm, and the dashboard board insights combine that runtime health with persisted local-model usage so operators can see whether llama.cpp is both reachable and carrying useful work.

When federation is enabled, the daemon also writes a machine-readable `federation-status.json` snapshot per swarm. The dashboard board insights surface federation enablement, bus/admin URLs, peer counts, and known peers directly from that snapshot.

Federated worker status updates also carry digest/handoff hashes. The orchestrator compares those against the latest persisted continuity packets and emits a federated drift report when a remote node is running against stale continuity state.

## Governance

Governance is enabled by default and can be disabled for a swarm with `DroidSwarm swarm --no-governance`. The runtime law set lives in [SYSTEM_LAWS.md](SYSTEM_LAWS.md), while the Brown-Hilbert reasoning/glyph reference lives in [Brown-Hilbert.md](Brown-Hilbert.md).

The shared governance package provides:

- built-in numbered laws with a manifest hash and compliance checks
- a debate engine that records planner/reviewer/verifier/guardian rounds before proposals become pending human approval
- Slack commands for `law propose` and `law approve <proposal-id>`
- dashboard governance views and approval controls
- federation law hash sync during slave onboarding

Optional provider/runtime env:

- `DROIDSWARM_CODEX_API_KEY`, `DROIDSWARM_CODEX_API_BASE_URL`, `DROIDSWARM_CODEX_CLOUD_MODEL`
- `DROIDSWARM_MODEL_APPLE` for the first-class local Apple Intelligence agent
- `DROIDSWARM_WORKER_HOST_ENTRY` when running a separate built worker runtime
- `DROIDSWARM_ENABLE_FEDERATION`, `DROIDSWARM_FEDERATION_PEERS`, `DROIDSWARM_FEDERATION_BUS_PORT`, `DROIDSWARM_FEDERATION_ADMIN_PORT`
- `DROIDSWARM_ENABLE_FEDERATION_ADB`, `DROIDSWARM_FEDERATION_ADB_PORT`, `DROIDSWARM_FEDERATION_ADB_BIN`
- `DROIDSWARM_FEDERATION_REMOTE_WORKERS_FILE`, `DROIDSWARM_FEDERATION_SIGNING_KEY_ID`, `DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY`

## Slave Swarm Onboarding

Provision a second machine as a federated slave swarm with:

```bash
./scripts/install-droidswarm.sh --connect-to <main-ip> --port 4950
```

That installation persists slave defaults into `~/.droidswarm/services.env`, including the slave role and the main swarm federation admin target. When you start the swarm on that machine:

```bash
DroidSwarm swarm --project-root "$PWD" --slave-mode --connect-to <main-ip>
```

the daemon starts the slave-safe runtime profile, runs the local federation bus, suppresses the dashboard and orchestrator, and sends a signed slave roll-call to the main swarm automatically.

On the main swarm, inspect or remove federated nodes with:

```bash
DroidSwarm nodes list
DroidSwarm nodes kick --node-id <node-id>
```
