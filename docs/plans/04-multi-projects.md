DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.DroidSwarm Multi-Project Single-Instance Architecture Plan
For Codex Agent Execution
Objective
Transform DroidSwarm from a per-project spawned system into a single central application (one global install, one running daemon, one dashboard) that can manage any number of onboarded projects simultaneously.
This aligns with the Asolaria federation model, enables shared agent pools across projects, and provides a unified control surface while keeping per-project isolation for tasks, git flows, and persistence.
Core User Experience

One-time DroidSwarm install / update.
DroidSwarm project onboard [path] (defaults to $PWD) to register a project.
System automatically detects git repository, stores project name/root/git info.
Single dashboard instance with project selector / tabs.
All existing commands (swarm, task, etc.) now accept --project <name|path> or operate on the currently selected project.

Potential Holes & Complications (and Mitigations)

State Isolation
Risk: Cross-project task leakage or git-flow collisions.
Mitigation: Global project registry + per-project SQLite namespaces (or separate DB files under ~/.droidswarm/projects/<project-id>/).

Orchestrator Model Change
Old design assumed one orchestrator per project.
Mitigation: Introduce a central “master orchestrator” that routes tasks to project-scoped worker pools. Existing per-project logic moves into isolated execution contexts.

Git Repository Handling
Not every folder is a git repo; remotes may be private; name detection can be ambiguous.
Mitigation: Require a valid git repo for onboarding; fall back to package.json name or prompt user; store canonical root + git remote hash.

Resource Contention
Multiple projects competing for the same agent pool / Apple Intelligence / llama.cpp.
Mitigation: Add project-level priority + resource quotas in the new model-router and shared-scheduler.

Dashboard State Synchronization
Single UI must reflect live state from multiple projects without lag or complexity.
Mitigation: Central WebSocket server already exists; add projectId to all EnvelopeV2 messages.

Migration from Old Per-Project Setups
Existing users have per-project folders with local state.
Mitigation: Provide DroidSwarm project migrate command that imports old state into the central registry.

Federation Compatibility
Agents will now be shared across projects.
Mitigation: Tag every task, handoff, and audit event with projectId. Federation bus already supports this via EnvelopeV2.

Backward Compatibility
Old DroidSwarm swarm calls in existing scripts must not break.
Mitigation: Keep legacy CLI behavior when a project is implicitly selected.


No fundamental blockers — all complications are solvable with clear namespacing and routing.
Key Benefits

True alignment with Asolaria federation (shared agents, one bus).
Single dashboard for all projects.
One system install and update cycle.
Easier multi-project workflows and resource sharing.

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging
Model-router with Apple Intelligence preference
Slack bot (optional but recommended)
Federation bus (Phase 1 already planned)

Phase 0: Global Registry & Persistence Layer

Create packages/shared-projects (if not present) with:
Project schema (id, name, rootPath, gitRemote, gitCommitHash, onboardedAt, status)
CRUD operations + validation

Add global SQLite table projects in the central ~/.droidswarm/registry.db.
Per-project storage: ~/.droidswarm/projects/<project-id>/ (tasks, checkpoints, git-flow state).
Migration helper: migrateLegacyProject(oldPath).

Phase 1: Onboard Command & CLI Updates

Add new CLI command in packages/bootstrap:
DroidSwarm project onboard [path] (defaults to process.cwd())
Auto-detect git repo → require clean git status → store name/root/git info.
Prompt for friendly name if not derivable from package.json or git.

Update all existing CLI commands to accept --project <name|path> flag.
Default to “current project” (stored in global config or selected via dashboard).
Add DroidSwarm project list, remove, migrate, status.

Phase 2: Central Master Orchestrator

Refactor apps/orchestrator into:
Master orchestrator (always running, routes by projectId)
Project-scoped worker pools (spawned on-demand per project)

Update EnvelopeV2 to require projectId on all messages.
Add lightweight scheduler that assigns agents/tasks across projects (respecting quotas).

Phase 3: Unified Dashboard (Single Instance)

Modify apps/dashboard to:
Show project selector / tabs at the top (dropdown + list).
Filter all views (tasks, agents, logs, audit) by selected project.
Global overview tab for all projects combined.

Update WebSocket server to broadcast projectId-scoped events.
Persist last-selected project in browser localStorage.

Phase 4: Integration & Polish

Hook onboarding into federation bus (auto-announce new project to peers).
Update model-router and shared-routing to be project-aware.
Update Slack bot commands to accept --project or default to selected project.
Add global DroidSwarm start / stop for the central daemon.
Update installer and bootstrap to provision the central registry on first run.

Phase 5: Testing & Validation

Onboard multiple projects (new + legacy migration).
Verify task isolation, git enforcement per project.
Test dashboard switching and live updates.
Confirm federation agents can be assigned across projects.
End-to-end: Slack command → specific project task.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
multi-project: Phase X - [short description]
Keep changes modular; maintain full backward compatibility during transition.
Reuse existing shared packages (shared-persistence, shared-routing, model-router, federation bus) wherever possible.
Ensure everything remains Mac-friendly, local-first, and secure.
After completing all phases, update documentation and provide a one-time migration guide.

This plan converts DroidSwarm into a true multi-project federation-ready system while preserving simplicity and power. Start with Phase 0.