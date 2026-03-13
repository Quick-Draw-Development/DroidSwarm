# Initial Setup Card

Bootstrap workflow for preparing a machine to run DroidSwarm locally with minimal manual steps. This setup is intended to work on the current machine for MVP and later be repeatable for other users with minor configuration changes.

## 1. Purpose & Scope
- Verify the machine has the required runtimes and tools
- Install missing project dependencies where practical
- Create and initialize the shared local SQLite database
- Ensure the dashboard and WebSocket server point at the same database and config
- Detect the active `project_name` and derive normalized `project_id` for this DroidSwarm instance
- Determine the project mode (`greenfield` or `existing`) for documentation and setup behavior
- Generate a machine-readable project metadata file for the system to consume
- Provide a single repeatable setup path for local/self-hosted installs

## 2. Required Components
- **Node.js**: 20+ for the dashboard and WebSocket server
- **npm**: package management for app dependencies
- **SQLite**: local embedded datastore used by both the board and socket server
- **Git**: for cloning/updating the project
- **Environment configuration**: `.env` / `.env.local` values for ports, shared secret, and database path
- **Project identity**: discovered `project_name` plus normalized `project_id`, both passed to all apps at runtime
- **Project mode**: explicit `greenfield` or `existing` mode passed to setup and stored in project metadata

## 3. Setup Responsibilities

### 3.1 Verify Prerequisites
- Check whether `node`, `npm`, `git`, and `sqlite3` are available
- Confirm minimum supported versions
- If a dependency is missing, either:
  - install it automatically when the environment allows, or
  - print exact install instructions for the host OS

### 3.2 Install Project Dependencies
- Install dashboard dependencies
- Install WebSocket server dependencies
- Prepare any shared packages if a monorepo/shared-lib layout is adopted

### 3.3 Detect Project Identity
- If `package.json` exists, read its `name` field and use that as `project_name`
- If there is no usable `package.json` name but the folder is a git repository, derive `project_name` from the git repository name
- If neither exists:
  - prompt for a git repository path/URL
  - check out the project into the current folder
  - derive `project_name` from the checked-out repository name
- Normalize `project_name` into a stable `project_id` safe for database records and config
- Persist both `project_name` and `project_id` into local configuration so all apps use the same values

### 3.4 Determine Project Mode
- Setup should accept an explicit project mode:
  - `greenfield`
  - `existing`
- Explicit mode is preferred for MVP instead of inference
- Persist `project_mode` into the generated project metadata file and setup state
- Use the Project Documentation Strategy Card to decide whether setup should create docs scaffolding or inspect existing docs

### 3.5 Detect Branch Configuration
- Detect whether the repository development base branch is `main` or `master`
- Record `production` as the live/protected branch
- Persist branch naming conventions for `feature/[task-id]`, `fix/[task-id]`, and `hotfix/[task-id]`

### 3.6 Initialize Project Documentation
- If `project_mode=greenfield`:
  - initialize a project documentation scaffold
  - create starter architecture/product/design documents
  - create or enable an `exec-plans` area for initiative planning
- If `project_mode=existing`:
  - inspect existing documentation first
  - preserve current project conventions where possible
  - add DroidSwarm-managed docs only where there are clear gaps
  - register authoritative existing doc locations in project metadata or references

### 3.7 Generate Project Metadata File
- Write a canonical file that all services can read, for example `./.droidswarm/project.json`
- Include at minimum:
  - `project_name`
  - `project_id`
  - `project_mode`
  - `main_branch`
  - `production_branch`
  - `feature_branch_prefix`
  - `fix_branch_prefix`
  - `hotfix_branch_prefix`
- Treat this file as the source of truth for project-specific variables discovered during setup

### 3.8 Initialize Datastore
- Create a shared local data directory (for example `./data/`)
- Create the SQLite database file (for example `./data/droidswarm.db`) if it does not exist
- Apply schema creation or migrations
- Enable required SQLite pragmas, especially WAL mode
- Ensure schema tables include `project_id`
- Seed any required baseline records if needed

### 3.9 Write Shared Configuration
- Ensure both services reference the same database path
- Ensure both services use the same privileged operator-room shared secret
- Ensure both services receive the same `project_name`, `project_id`, and `project_mode`
- Ensure both services can read the generated project metadata file path
- Write default local ports:
  - dashboard: `3000`
  - WebSocket server: `8765`

## 4. Database Scope
The shared SQLite database should persist:
- tasks
- channels/rooms
- messages
- agent/session metadata
- task intake events
- connection/audit events

All persisted rows should include `project_id` so one shared SQLite file can support multiple projects in the future even though each DroidSwarm instance is project-scoped.

This allows the board to render historical task/channel state and the socket server to act as the real-time transport layer while persisting all durable state.

## 5. Recommended Outputs
The setup process should leave the machine with:
- installed Node.js dependencies
- a created/migrated SQLite database
- a resolved `project_name`, persisted `project_id`, and persisted `project_mode`
- a generated project metadata file with branch and project variables
- project documentation initialized or registered according to `project_mode`
- working local configuration files
- a clear success/failure report
- next-step commands to start the socket server and dashboard

## 6. MVP Automation Shape
Recommended entry points:
1. `npm install`
2. `npm run setup`
3. `npm run dev`

Where `npm run setup` should:
- verify prerequisites
- derive `project_name`, normalize `project_id`, and persist both
- record `project_mode`
- detect branch configuration and generate the project metadata file
- initialize or inspect project documentation according to project mode
- initialize or migrate SQLite
- write any missing local config defaults

## 7. Future Extensions
- Cross-platform install helper scripts
- Optional desktop packaging
- Optional backup/replication for SQLite
- Optional PostgreSQL target for hosted or multi-machine deployments

## 8. Open Question To Revisit
- Decide whether setup should automatically install missing system dependencies (`node`, `npm`, `sqlite3`, `git`) or stop and print OS-specific installation instructions instead
