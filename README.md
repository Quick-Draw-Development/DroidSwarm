# DroidSwarm

This repository is an Nx monorepo for a local-first, durable multi-agent system. `apps/orchestrator` remains the canonical control plane, `apps/dashboard` is the primary UI, `apps/socket-server` is the live messaging gateway, and `apps/blink-bridge` mirrors the canonical task chat to Blink/Slack.

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

List active swarms:

```bash
DroidSwarm list
```

Shut down one swarm:

```bash
DroidSwarm shutdown --swarm-id <id>
```

Shut down all swarms:

```bash
DroidSwarm shutdown --all
```

## Current Scope

The repo now carries the shared contracts and persistence scaffolding for multi-project runs, repo-target/workspace scoping, canonical task chat, worker results and heartbeats, project memory, skill packs, local-first routing, and strict git-flow enforcement. Existing durable runs/tasks/checkpoints are preserved and extended rather than replaced.

## Workspace Layout

- `apps/orchestrator`: durable control-plane service that ingests operator/channel events, persists runs/tasks/checkpoints, schedules Codex workers, and feeds the dashboard timeline.
- `apps/dashboard`: Next.js dashboard that reads directly from the orchestrator datastore and now exposes project, task chat, heartbeat, routing, and memory views.
- `apps/socket-server`: live operator/agent gateway that now mirrors canonical task chat records into persistence.
- `apps/blink-bridge`: Blink/Slack synchronization adapter for the canonical task chat stream.
- `apps/worker-host`: optional local worker runtime for adapter-based execution.
- `packages/*`: shared contracts and services for routing, workers, projects, git policy, memory, chat, skills, Mux, Codex, llama.cpp, tracing, and persistence helpers.
- `skills/*`: shared skill packs for orchestrator, planner, researcher, reviewer, bugfix, feature, repo onboarding, and PR review.
- `packages/bootstrap`: install/setup scripts, CLI assets, and system specs.

## Architecture docs

- `docs/orchestrator-architecture.md` describes the final control-plane flow (durable runs/tasks, scheduler decisions, supervisor lifecycle, and the dashboard insights that read them).
- `docs/orchestrator-protocol-migration.md` details the execution-centered event schema (`plan_proposed`, `verification_requested`, `artifact_created`, etc.) and how clients should emit/persist those events when the orchestrator restarts.
- `docs/orchestrator-runlife-guide.md` explains the explicit run lifecycle, dependency semantics, durable event flow, policy enforcement, operator command model, and restart/recovery guarantees that now drive the control plane.
- `docs/architecture/*.md` covers the merged multi-project system, worker contract, chat sync, project registry, routing policy, git policy, checkpoint memory, and Blink bridge.

## Testing

- `npx nx test orchestrator` runs the Phase 10 end-to-end coverage (intake → decomposition → scheduling → verification/review → cancellation → restart/resume).
- `npx nx typecheck dashboard` exercises the new insights panel that now surfaces runs, tasks, artifacts, checkpoints, budgets, assignments, verifications, and timeline events from the persistent datastore.
- `npx nx test socket-server` verifies the live gateway persistence and protocol validation paths, including canonical task chat persistence.

## Runtime Setup

Installer and runtime management now expect Blink server, Mux, and llama.cpp to be available through env-configured binaries or install commands:

- `DROIDSWARM_BLINK_SERVER_BIN` or `DROIDSWARM_BLINK_SERVER_INSTALL_CMD`
- `DROIDSWARM_MUX_BIN` or `DROIDSWARM_MUX_INSTALL_CMD`
- `DROIDSWARM_LLAMA_SERVER_BIN` or `DROIDSWARM_LLAMA_INSTALL_CMD`
- `DROIDSWARM_LLAMA_MODEL` and optionally `DROIDSWARM_LLAMA_MODEL_DOWNLOAD_CMD`

The installer writes the resolved service configuration to `~/.droidswarm/services.env`. Swarm startup reads that file, starts Blink server, Mux, and llama.cpp as managed services, and exports their local URLs to the orchestrator.

Optional provider/runtime env:

- `DROIDSWARM_CODEX_API_KEY`, `DROIDSWARM_CODEX_API_BASE_URL`, `DROIDSWARM_CODEX_CLOUD_MODEL`
- `DROIDSWARM_SLACK_BOT_TOKEN`, `DROIDSWARM_SLACK_API_BASE_URL`
- `DROIDSWARM_BLINK_API_TOKEN`, `DROIDSWARM_BLINK_API_BASE_URL`
- `DROIDSWARM_WORKER_HOST_ENTRY` and `DROIDSWARM_BLINK_BRIDGE_ENTRY` when running separate built runtimes
