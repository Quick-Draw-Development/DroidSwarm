# DroidSwarm Bootstrap

This repository is now structured as an Nx monorepo with separate projects for the dashboard, socket server, and bootstrap assets.

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

This is a lifecycle scaffold for the upcoming implementation. `setup` initializes project metadata under `./.droidswarm`, and `swarm` now requires that setup to be complete before it will start a managed instance. The current background process is a lightweight manager so `list` and `shutdown` work end-to-end before the full application exists.

## Workspace Layout

- `apps/dashboard`: Next.js dashboard application scaffold
- `apps/socket-server`: Node.js socket server scaffold
- `packages/bootstrap`: install/setup scripts, CLI assets, and system specs

## Architecture docs

- `docs/orchestrator-architecture.md` describes the final control-plane flow (durable runs/tasks, scheduler decisions, supervisor lifecycle, and the dashboard insights that read them).
- `docs/orchestrator-protocol-migration.md` details the execution-centered event schema (`plan_proposed`, `verification_requested`, `artifact_created`, etc.) and how clients should emit/persist those events when the orchestrator restarts.

## Testing

- `npx nx test orchestrator` runs the Phase 10 end-to-end coverage (intake → decomposition → scheduling → verification/review → cancellation → restart/resume).
- `npx nx typecheck dashboard` exercises the new insights panel that now surfaces runs, tasks, artifacts, checkpoints, budgets, assignments, verifications, and timeline events from the persistent datastore.
