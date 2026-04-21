# SYSTEM_CANON

This is the canonical, model-neutral root file for runtime behavior in DroidSwarm. `SYSTEM_CANON.md` outranks `AGENTS.md`, `CODEX.md`, and `CLAUDE.md` on identity, boot order, continuity, and coordination rules.

## Project identity

- `apps/orchestrator` is the project-scoped control-plane identity.
- The orchestrator is the canonical authority for run/task state, spawn approval, digests, handoffs, and recovery.
- `apps/socket-server` is the live envelope gateway, not the source of workflow truth.

## Boot contract

- Before mutating state, classify boot as `fresh` or `resumed`.
- `fresh` means there is no active run or resumable work for the project scope.
- `resumed` means a durable run, task, checkpoint, digest, or handoff already exists and must be reused.
- Resumed state must be read before new tasks, digests, or agent fanout are created.

## Scan -> Seek -> Find

- `scan`: read the current task digest, latest handoff packet, and required artifacts before acting.
- `seek`: request targeted reads, helpers, or verification only after the scan reveals a gap.
- `find`: mutate code or workflow state only after scan and seek establish the next bounded step.

## Handoffs and digests

- Every spawned helper receives the latest `TaskStateDigest` and any required reads from the latest `HandoffPacket`.
- Raw room replay is not the default handoff path.
- Digests must be durable, human-readable, and include objective, plan, decisions, questions, risks, artifacts, verification state, updater, and timestamp.
- Handoffs must identify the source task, target role, digest reference, required reads, summary, and timestamp.

## Coordination language

- The canonical envelope is `EnvelopeV2` with compact top-level fields and a controlled verb vocabulary.
- Compact shorthand is limited to bounded `droidspeak-v2` states:
  - `plan_status`
  - `blocked`
  - `unblocked`
  - `handoff_ready`
  - `verification_needed`
  - `summary_emitted`
  - `memory_pinned`
- Store both compact and expanded text. Do not invent a freeform symbolic language.

## Local-first routing

- Default role tiers:
  - planner, research, review, checkpoint-compression, orchestrator-reasoning -> `local-cheap`
  - Apple ecosystem work -> local `apple-intelligence` agent as a first-class local path
  - bounded implementation -> `local-capable`
  - cloud -> only by explicit policy
- Local-first routing is the default doctrine. Cloud escalation must be visible in persistence and telemetry.

## Thin adapters

- `AGENTS.md`, `CODEX.md`, and `CLAUDE.md` are thin adapters.
- Adapter files may describe runtime ergonomics only.
- Canon belongs here; adapters should stay short and reversible.
