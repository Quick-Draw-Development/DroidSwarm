# SYSTEM_LAWS

These are the active numbered laws for DroidSwarm governance.

## LAW-001

Governance, federation, and other system-critical internal events must preserve Droidspeak-compatible compact state.

## LAW-002

Governance actions must be recorded in the tamper-evident audit trail.

## LAW-003

Adaptive law changes require explicit human approval before activation.

## LAW-004

Debates that change system behavior require quorum from planner, reviewer, and verifier roles, with guardian veto support.

## LAW-005

Slave swarms must not host the dashboard or claim master governance authority.

## LAW-006

Require explicit governance summaries at startup.

## Skill And Agent Extension Rules

- New skills and specialized agents must register through the shared skills registry before they are treated as active runtime capabilities.
- Skill manifests must declare valid Droidspeak verbs for any new internal event surface they introduce.
- Skill packs or agents that affect core behavior may remain pending until explicit human approval.

## Role-Based Consensus And Drift Rules

- High-impact actions such as agent spawns, task handoffs, and law changes must record a lightweight consensus round across proposer, reviewer, verifier, guardian, and arbitrator roles.
- Guardian vetoes and human overrides must be preserved in the tamper-evident governance audit trail.
- The system state hash includes active laws, registered skills, specialized agents, and the Droidspeak catalog and must be checked continuously across federated nodes.
- Drift mismatches must be surfaced to operators through governance status surfaces before normal automation proceeds.
- Code review outcomes that influence merge integrity on critical paths must emit review-specific Droidspeak events and run through the same consensus and tracing surfaces.
