DroidSwarm Lightweight Role-Based Consensus & Drift/Compliance Plan
For Codex Agent Execution
Objective
Enhance the existing shared-governance package with a lightweight role-based consensus system (inspired by Shannon roles but simplified to 5 core roles) and add drift/compliance checks that run continuously across the master swarm and all federated slaves.
This gives us structured decision-making, clear accountability, and early detection of any divergence while staying minimal, performant, and fully integrated with Droidspeak, shared-tracing, federation bus, and the orchestrator.
Key Principles

Only 5 lightweight roles (no 108-cell cube).
Every important action (task handoff, skill activation, law change, agent spawn, etc.) goes through a short consensus round.
Drift/compliance is checked automatically and logged tamper-evidently.
All internal messages remain in Droidspeak.
Human override always available via Slack/dashboard.
Zero breaking changes to existing flows.

Phase 0: Extend shared-governance Package

Update packages/shared-governance with new files:
roles.ts — define the 5 core roles:
PROPOSER (initiates action)
REVIEWER (arguments for/against)
VERIFIER (fact-checks compliance)
GUARDIAN (veto power on law/safety violations)
ARBITRATOR (final tie-breaker)

consensus-state.ts — simple consensus object schema (Proposal ID, round, role verdicts, quorum status, outcome).
consensus-engine.ts — core logic for running role-assigned rounds.

Add role-to-agent mapping in the registry so the orchestrator knows which agents can fulfill each role.

Phase 1: Lightweight Consensus Engine

Implement runConsensusRound(proposal: Proposal) in consensus-engine.ts:
Assign required roles to available agents (using model-router for selection).
Run 2–3 short debate rounds using Droidspeak.
Collect signed verdicts and compute quorum (default: 3/5 roles agree + no Guardian veto).
Output: { approved: boolean, reason: DroidspeakGlyph, auditHash }

Hook the engine into the orchestrator so any high-impact action automatically triggers a consensus round.
Extend EnvelopeV2 to include an optional consensus field for all governance-related messages.

Phase 2: Drift & Compliance Checks

Create drift-supervisor.ts (and immune-governance-supervisor.ts):
Periodically compute a system state hash (laws manifest + skill registry + active agents + Droidspeak catalog).
Broadcast hash via federation bus to all slaves.
Slaves respond with their local hash; mismatches trigger drift alert.

Add validateCompliance(lawId?: string) helper that:
Runs every law’s enforcement function.
Logs violations to shared-tracing with full role-based audit.

Integrate checks at key points:
On slave onboarding.
On every skill/agent registration.
On every task handoff.
Every 60 seconds in the background.


Phase 3: Integration Points

Update:
Master orchestrator to route proposals through the new consensus engine.
Federation bus to handle EVT-CONSENSUS-ROUND and EVT-DRIFT-DETECTED verbs.
Shared-tracing to automatically record every consensus round and compliance check.
Model-router to prefer Apple Intelligence for debate rounds on Mac nodes.
Worker-host to respect role assignments when spawning agents.

Update Slack bot and dashboard:
Show active consensus rounds and drift status.
Allow human override (/droid override <proposal-id> or dashboard button).

Add CLI commands:
DroidSwarm governance status
DroidSwarm governance roles list


Phase 4: Safety & Polish

Implement Guardian veto escalation to human admin (Slack + dashboard notification).
Add rollback capability: if drift is detected, automatically pause affected nodes until resolved.
Ensure all new governance events are fully Droidspeak-encoded internally and translated only at user boundaries.

Phase 5: Testing & Validation

Unit tests for role assignment, consensus rounds, and quorum calculation.
Integration tests: simulate proposal → role debate → approved/rejected outcome.
Drift test: manually alter a law on a slave → verify detection and alert.
End-to-end: multi-project + multi-slave scenario with a governance proposal.
Performance test: confirm consensus rounds add < 300 ms latency for typical decisions.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
governance: Phase X - [short description]
Reuse existing packages (shared-droidspeak, shared-tracing, federation-bus, model-router, orchestrator, worker-host) wherever possible.
Keep all changes modular and fully backward-compatible.
Ensure everything remains Mac-friendly, local-first, secure, and compliant with current laws.
After completion, update SYSTEM_LAWS.md to document the new role-based consensus process and drift/compliance rules.

This plan gives DroidSwarm the structured, role-aware decision-making and proactive drift protection we need for reliable federation without adding heavy formal machinery.
Start with Phase 0.