DroidSwarm Hermes-Inspired Enhancements Plan
For Codex Agent Execution
Objective
Implement two Hermes-inspired features while preserving DroidSwarm’s strengths (federation, governance, Droidspeak, tamper-evident tracing, Mac-first model routing, and dynamic skills):

Lightweight autonomous skill-evolution loop — the swarm periodically reflects on its performance, identifies gaps, and proposes/refines skills using procedural memory and self-nudging (Hermes-style).
Strengthened cross-session personal/project memory — rich, long-term semantic and procedural memory that persists across restarts, sessions, projects, and federated nodes (beyond current TaskStateDigest/checkpoints).

Both features remain fully governed: no automatic activation without human approval or lightweight role-based consensus.
Key Principles

All internal reasoning and memory storage uses Droidspeak.
Every evolution step and memory write is logged to shared-tracing.
Human-in-the-loop + governance approval is mandatory for skill changes.
Memory is project-scoped by default but can be marked “global” or “personal”.
Fully federation-aware: slaves sync memory and evolution proposals to the master.
Lightweight and configurable (background job with low resource impact).

Phase 0: Enhanced Memory Foundation

Extend packages/shared-persistence with a new long-term-memory table (or separate memory.db):
Fields: id, projectId, sessionId, timestamp, memoryType (semantic | procedural | pattern | user-preference), droidspeakSummary, englishTranslation, sourceEventHash, relevanceScore, expiresAt.

Add memory-store.ts and memory-retrieval.ts in a new packages/shared-memory library.
Implement semantic embedding (via Apple Intelligence or a small local embedding model) for fast retrieval.
Migrate existing task checkpoints into the new memory system.

Phase 1: Procedural Memory & Reflection Engine

Add procedural-memory.ts that records successful/failed trajectories (full EnvelopeV2 + outcome + Droidspeak summary).
Create reflection-engine.ts (runs on a configurable schedule, e.g., every 30–60 min or after N completed tasks):
Analyzes recent trajectories for patterns, failures, and skill gaps.
Uses model-router (Apple Intelligence preferred) to generate self-nudges (“We keep failing on X → we need a new skill for Y”).

Store reflection results as long-term memory entries.

Phase 2: Autonomous Skill-Evolution Loop

Build skill-evolution-loop.ts in shared-skills:
Triggered by reflection engine or manually (DroidSwarm evolve).
Generates candidate skill improvements or entirely new skills based on procedural memory.
Produces a full skill manifest + implementation stub (using the existing scaffolding logic).

Extend agent-builder to support evolution mode (evolveSkill(existingSkillId)).
All proposals are wrapped in Droidspeak and logged to tracing.

Phase 3: Governance & Human Approval Integration

Hook the evolution loop into shared-governance:
Every proposed skill change triggers a lightweight consensus round (Proposer = reflection engine, Reviewer/Verifier/Guardian = specialized agents).
Outcome is either “Rejected” or “Pending Human Approval”.

Add Slack + dashboard interfaces:
/droid evolve status
/droid skill approve <proposal-id>
Dashboard “Evolution Proposals” tab with diff view of new/updated skill code.

On human approval:
Auto-build and register the skill.
Broadcast to all federated slaves via federation bus.
Trigger hot-reload on worker-host.


Phase 4: Cross-Session Retrieval & Usage

Extend model-router, orchestrator, and worker-host to query long-term memory on task start:
Retrieve relevant procedural patterns, codebase conventions, user preferences.
Inject top-K memories into agent prompts (via Droidspeak for token efficiency).

Add memory pruning logic (relevance decay + configurable retention policy).
Make memory searchable via Slack (/droid memory search "how we handle errors") and dashboard.

Phase 5: Testing & Validation

Unit tests for memory storage/retrieval, reflection analysis, and skill proposal generation.
Integration tests: simulate repeated task failures → reflection triggers → evolution proposal → governance review → approved skill is created and used.
End-to-end test: complete a multi-session workflow across projects → verify memory is recalled correctly on next session.
Federation test: evolution proposal on master → slaves receive and activate the new skill.
Governance test: ensure every evolution step is auditable and requires human sign-off.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
hermes-enhancements: Phase X - [short description]
Reuse existing packages (shared-persistence, shared-skills, agent-builder, shared-governance, shared-tracing, model-router, federation-bus, orchestrator, Slack bot, dashboard) wherever possible.
Keep all new code modular and behind a feature flag (DROIDSWARM_ENABLE_HERMES_LOOP=true).
Ensure everything remains Mac-friendly, local-first, secure, and compliant with all laws.
After completion, update SYSTEM_LAWS.md, SKILLS.md, and AGENTS.md with the new memory and evolution capabilities.

This plan brings the best of Hermes’ self-improving nature into DroidSwarm while staying true to our governance, federation, and efficiency principles.
Start with Phase 0.

## Completion

Completed on 2026-04-27.

Implemented:

- `packages/shared-persistence` long-term memory database support and a real `packages/shared-memory` library for storage, retrieval, pruning, procedural memory, reflection, and CLI access.
- Orchestrator prompt injection plus checkpoint-to-memory bridging so relevant long-term memories are available at task start.
- Governed skill evolution in `packages/shared-skills`, including proposal persistence, consensus-backed proposal generation, human approval, and scaffold registration.
- Operator surfaces for Hermes flows in the bootstrap CLI (`DroidSwarm memory ...`, `DroidSwarm evolve ...`), Slack (`/droid memory search`, `/droid evolve status`, `/droid evolve run`, `/droid skill approve <proposal-id>`), and the dashboard (Long-Term Memory and Evolution Proposals panels).
- Federation onboarding sync for recent memories and governed evolution proposals so slave nodes inherit current signals instead of starting cold.
- Documentation updates in `SYSTEM_LAWS.md`, `SKILLS.md`, and `AGENTS.md`.

Validation completed with Nx typechecks/tests for the touched packages and `bash -n packages/bootstrap/bin/DroidSwarm`.
