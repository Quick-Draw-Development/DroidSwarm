# Model Routing

DroidSwarm keeps model inventory in the shared registry and per-node cache. `packages/shared-models` is the canonical source for discovery, normalization, cache refresh, and registry sync.

## Decision Matrix

- `code-review-agent`, reviewer, coder roles: prefer high-reasoning tool-capable models with larger context. `qwen2.5-coder`-style local llama models score highest when available.
- `planner`, `researcher`, `checkpoint` roles: prefer high-reasoning models with balanced speed and larger context.
- `verifier`, `guardian` roles: prefer faster low-latency models unless explicit context pressure requires a larger one.
- Apple ecosystem work still prefers `apple-intelligence` first on `darwin/arm64` when the runtime is enabled.
- If Apple runtime is unavailable, MLX is preferred for heavy local contexts before falling back to `local-llama`.

## Scoring

`selectModelForRole()` in `packages/model-router` scores candidates from the shared inventory using:

- reasoning depth
- speed tier
- context fit
- tool-use support
- role and use-case tag hints

The router first evaluates the preferred backend, then falls back to the best available model across the full inventory if that backend has no suitable match.

## Inventory Flow

- `DroidSwarm models refresh` rescans local models and updates the registry.
- Swarm startup refreshes inventory through orchestrator config loading.
- Slave roll-call includes model inventory; the master merges that snapshot into the global registry.
- Slack supports `/droid models list` and `/droid models refresh`.
- The dashboard exposes the shared inventory in the Models panel.

## Compatibility

`DROIDSWARM_MODEL_*` and `DROIDSWARM_LLAMA_*` remain valid fallbacks. Inventory-aware routing only overrides them when the shared registry has a better matching local model for the requested role.
