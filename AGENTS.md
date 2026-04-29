# AGENTS root instructions

`SYSTEM_CANON.md` is the root canon for repository identity, boot order, continuity, scan -> seek -> find, handoffs, digests, and role rules. `SYSTEM_LAWS.md` is the numbered governance companion for enforcement-oriented runtime law. `SKILLS.md` documents the dynamic skill and specialized-agent registry surface. `MODEL-ROUTING.md` documents shared inventory refresh and role-to-model selection rules. Runtime-branded adapters must remain thin and reversible.

The built-in `code-review-agent` is the canonical specialized reviewer for diff and PR analysis. Use the registered skill/agent flow and `DroidSwarm review run <pr-id>` rather than ad hoc review scripts when extending review automation.
Use `DroidSwarm models refresh|status` and the shared model registry instead of bespoke llama inventory parsing when extending local model behavior.
Use the shared Hermes surfaces for durable memory and skill evolution: `DroidSwarm memory ...` for retrieval/pruning and `DroidSwarm evolve ...` for governed reflection proposals. If `DROIDSWARM_ENABLE_HERMES_LOOP=true` is enabled, treat reflected memory and evolution proposals as first-class operator surfaces rather than ad hoc local state.
Use `DroidSwarm engines mythos ...` and the shared Mythos runtime registry for recurrent-engine work. If `DROIDSWARM_ENABLE_MYTHOS=true` is enabled, LAW-099 spectral stability checks and Mythos inventory metadata are the canonical source of truth for deep-reasoning execution.

## Nx commands (mandatory)

- **Linting**: `npx nx lint`
- **Type checking**: `npx nx typecheck`
- **Testing**: `npx nx test`
- **App-specific verification**:
  - `npx nx test orchestrator`
  - `npx nx typecheck dashboard`
  - `npx nx test socket-server` (when relevant)

These commands must be used for their respective checks unless the user explicitly asks for alternatives.

## Adapter rule

- `AGENTS.md`, `CODEX.md`, and `CLAUDE.md` may add runtime launch notes only.
- If adapter guidance conflicts with `SYSTEM_CANON.md`, `SYSTEM_CANON.md` wins.
- Keep adapter files thin. Do not duplicate project canon here.
- Every agent must follow the behavioral guidelines defined in `SYSTEM_CANON.md` before making code changes.
