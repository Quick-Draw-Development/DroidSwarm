DroidSwarm Federated Slave Swarm Onboarding Plan
For Codex Agent Execution
Objective
Add full federation support by enabling slave swarms (remote machines/nodes) to join the central DroidSwarm instance (the “main swarm”).
A single install script will:

Provision the complete DroidSwarm stack (orchestrator, agents, skills, model-router, Droidspeak, shared-tracing, federation bus, etc.) on the new machine.
Connect the new node to the main swarm by supplying the main swarm’s IP address.
Automatically enforce all the same laws/rules as the main swarm (Droidspeak-only internal comms, tamper-evident audit logging, security policies, task isolation, resource quotas, governance gates).

This completes the Asolaria-inspired federation vision: one central control plane with cheap horizontal scaling across any number of desktops, laptops, or servers while maintaining perfect rule compliance.
Key Principles

One-command onboarding: install-droidswarm.sh --connect-to <main-ip> [--port 4947]
Slave mode: New node runs the exact same codebase but in “slave” mode (follows orders, reports status, does not host the dashboard or master orchestrator).
Rule enforcement: Every slave must use Droidspeak internally, write to shared-tracing audit log, respect project isolation, and pass drift/immune checks.
Zero manual config: Auto-onboarding via federation bus (roll-call → verification → bundle sync if needed).
Backward compatible: Existing single-machine installs remain unchanged.
Security first: Only trusted nodes join; all traffic signed and encrypted.

Phase 0: Federation Bus Foundation (Prerequisite)

Complete packages/federation-bus (from earlier federation plan):
postToBus(), kickPeer(), heartbeat, verb routing on ports 4947/4950.
Basic Ed25519 signing + replay protection.

Add node-id and swarm-role (master/slave) to global config.

Phase 1: Enhanced Install Script

Extend existing scripts/install-droidswarm.sh with new flags:
--connect-to <ip> (required for slave onboarding)
--slave-mode (auto-enabled when --connect-to is present)

Script behavior on slave:
Run full install (Node, Nx build, all packages, llama.cpp/Apple Intelligence setup).
Generate local node keypair and store in secure keychain.
Immediately send encrypted roll-call message to main IP:4947 with node details.

Update packages/bootstrap to detect slave mode and start only slave-appropriate services (no dashboard, no master orchestrator).

Phase 2: Slave Onboarding Supervisor

Create packages/federation-bus/src/slave-onboarding-supervisor.ts (modeled on Asolaria’s new-applicant-onboarding-supervisor).
Flow on new slave:
Send EVT-SLAVE-ROLL-CALL to main swarm.
Main swarm responds with EVT-SLAVE-WELCOME + current rules hash + Droidspeak catalog.
Slave verifies rules hash; if mismatch, auto-pull latest bundle and restart.

Main swarm side (in master orchestrator):
Listen for roll-call.
Run verification (key signature, hardware fingerprint hash, version match).
Register slave in global shared-projects / node registry with role=slave.
Send full configuration (Droidspeak catalogs, law set, resource quotas).


Phase 3: Law / Rule Enforcement Layer

Create packages/shared-laws (or extend shared-tracing):
Central LAW-001 manifest (JSON + Droidspeak-encoded) defining:
Droidspeak mandatory for all internal messages.
Tamper-evident audit logging required.
Project isolation, rate limits, code-execution sandbox.
No local dashboard on slaves.


On every slave startup and after any federation message:
Run enforceLaws() which checks compliance and self-kicks if violated.

Add immune-l1-supervisor (lightweight drift detection) that periodically broadcasts state hash to main swarm.

Phase 4: Integration with Existing Systems

Update:
Master orchestrator → route tasks to slave nodes via federation bus.
Droidspeak translator → enforce on all cross-node messages.
Model-router → slaves prefer local Apple Intelligence / llama.cpp.
Shared-tracing → every slave writes to its local audit log; main swarm can request Merkle proofs.
Slack bot & dashboard → show live federated slave status (online, agent count, current load).

Add CLI on main swarm: DroidSwarm nodes list, DroidSwarm nodes kick <node-id>.

Phase 5: Testing & Validation

End-to-end test: spin up main swarm → run install script on second machine with --connect-to <main-ip> → verify slave appears in dashboard and can receive/execute tasks.
Rule compliance test: attempt to send English message internally → must be rejected.
Drift test: manually change a law on slave → auto-reconnect or self-kick.
Multi-slave test: onboard 2–3 slaves and confirm task distribution.
Security test: invalid signature or version mismatch → onboarding rejected.

Execution Instructions for Codex Agent

Follow phases strictly in order (start with Phase 0 + Phase 1).
Commit after each phase with message:
federation-slave: Phase X - [short description]
Reuse existing packages (federation-bus, shared-droidspeak, shared-tracing, shared-projects, model-router) wherever possible.
Keep all new code modular and behind federation flags.
Ensure Mac-friendly (Apple Silicon slaves fully supported) and local-first.
After all phases, update documentation with clear “How to onboard a slave swarm” section and example command.

This plan turns DroidSwarm into a true federated system where slave swarms are first-class citizens that install themselves, connect automatically, and obey the exact same laws as the main swarm — delivering the massive horizontal scaling you want while staying secure and consistent.