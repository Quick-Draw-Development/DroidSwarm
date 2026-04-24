# Brown-Hilbert

This document is DroidSwarm's governance-era Brown-Hilbert reference. It is intentionally compact and operational.

## Axes

- `A`: actor identity and role
- `V`: verb and intent class
- `M`: execution mode
- `R`: risk level
- `L`: law reference
- `P`: project scope
- `Q`: quorum and vote state
- `H`: human approval state

## Governance Glyph Vocabulary

- `EVT-LAW-PROPOSAL`
- `EVT-DEBATE-ROUND`
- `EVT-VOTE`
- `EVT-HUMAN-APPROVAL`
- `EVT-LAW-UPDATE`
- `EVT-COMPLIANCE-CHECK`
- `EVT-GUARDIAN-VETO`

## Reasoning Primitives

- Proposal: a candidate change to law or governance behavior
- Argument: a structured claim for or against a proposal
- Rebuttal: a targeted response to an argument
- Vote: a role-scoped approval, rejection, or veto
- Quorum: the minimum role coverage required for a valid decision
- Guardian veto: an explicit blocking vote from a designated guardian role
- Human approval: the only path that can activate an adaptive law proposal

## Operational Rule

Governance events must preserve both compact glyph-oriented state and natural-language explanation so the audit trail remains machine-verifiable and human-reviewable.
