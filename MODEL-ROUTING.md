# Model Routing

DroidSwarm keeps model inventory in the shared registry and per-node cache. `packages/shared-models` is the canonical source for discovery, normalization, cache refresh, and registry sync.

## Decision Matrix

- `code-review-agent`, reviewer, coder roles: prefer high-reasoning tool-capable models with larger context. `qwen2.5-coder`-style local llama models score highest when available.
- `planner`, `researcher`, `checkpoint` roles: prefer high-reasoning models with balanced speed and larger context.
- `verifier`, `guardian` roles: prefer faster low-latency models unless explicit context pressure requires a larger one.
- Deep recurrent reasoning, long-horizon review, governance, and evolution tasks prefer `openmythos` when `DROIDSWARM_ENABLE_MYTHOS=true` and the runtime is available.
- When `DROIDSWARM_ENABLE_RALPH=true`, long-horizon/self-correcting/polishing/recovery tasks with expected iteration counts above 8 are marked for the `ralph-wiggum-worker` persistent loop instead of one-shot local planning.
- Apple ecosystem work still prefers `apple-intelligence` first on `darwin/arm64` when the runtime is enabled.
- If OpenMythos is unavailable, Apple runtime is preferred first on Apple Silicon, then MLX for heavy local contexts, then `local-llama`.

## Scoring

`selectModelForRole()` in `packages/model-router` scores candidates from the shared inventory using:

- reasoning depth
- speed tier
- context fit
- tool-use support
- role and use-case tag hints
- recurrent-depth preference for `openmythos`

The router first evaluates the preferred backend, then falls back to the best available model across the full inventory if that backend has no suitable match.

## Ralph Routing

Ralph selection is driven by routing signals rather than a separate backend:

- `expected_iterations > 8`
- `self_correction_needed = true`
- `long_horizon = true`
- `polishing_phase = true`
- `failure_recovery_mode = true`

When these signals are present and Ralph is enabled, the routing layer emits `routeKind = ralph-persistent-loop`, attaches the `ralph-wiggum-worker` skill pack, and keeps execution local-first with the best available backend for each iteration.

## Inventory Flow

- `DroidSwarm models refresh` rescans local models and updates the registry.
- `DroidSwarm engines mythos status` inspects the local OpenMythos runtime and persists its spectral/loop snapshot into the shared registry.
- `DroidSwarm models discover` polls configured remote sources and records remote GGUF candidates as `discovered` until they are downloaded.
- `DroidSwarm models new` shows newly discovered models waiting for onboarding.
- `DroidSwarm models download <model-id>` downloads, validates, and activates a discovered model.
- Swarm startup refreshes inventory through orchestrator config loading.
- If model discovery is enabled, orchestrator startup also begins the optional discovery loop using the shared polling interval.
- Slave roll-call includes model inventory; the master merges that snapshot into the global registry.
- Slave roll-call includes OpenMythos runtime snapshots when available because they are represented as `openmythos` inventory entries with spectral metadata.
- Slack supports `/droid models list`, `/droid models new`, `/droid models discover`, and `/droid models download <model-id>`.
- Slack also supports `/droid mythos status` and `/droid mythos loops <engine-id> <count>` for local runtime control.
- The dashboard exposes the shared inventory plus recently discovered models in the Models panel.
- The dashboard also exposes a “Cognitive Engines” panel for OpenMythos runtime status.

## Discovery Sources

- Hugging Face GGUF API is the primary source.
- Local AI Zone is an optional fallback source and is disabled by default.
- Discovery remains off by default until explicitly enabled in config or via env.

## Configuration

Discovery settings are stored in the shared registry and can be inspected or updated with `DroidSwarm models config`.

Example:

```bash
DroidSwarm models config --set --enabled true --trusted-authors bartowski,unsloth,mradermacher --auto-download-small false
```

Related env vars:

- `DROIDSWARM_MODEL_DISCOVERY_ENABLED`
- `DROIDSWARM_MODEL_DISCOVERY_INTERVAL_MS`
- `DROIDSWARM_MODEL_DISCOVERY_TRUSTED_AUTHORS`
- `DROIDSWARM_MODEL_DISCOVERY_BLOCKED_AUTHORS`
- `DROIDSWARM_MODEL_DISCOVERY_AUTO_DOWNLOAD_SMALL`
- `DROIDSWARM_MODEL_DISCOVERY_AUTO_DOWNLOAD_MAX_BYTES`
- `DROIDSWARM_ENABLE_MYTHOS`
- `DROIDSWARM_MODEL_MYTHOS`
- `DROIDSWARM_MYTHOS_PYTHON_BIN`
- `DROIDSWARM_MYTHOS_DEFAULT_LOOPS`
- `DROIDSWARM_MYTHOS_MAX_LOOPS`

## Compatibility

`DROIDSWARM_MODEL_*` and `DROIDSWARM_LLAMA_*` remain valid fallbacks. `DROIDSWARM_ENABLE_MYTHOS=true` only opts the recurrent backend into the same shared-inventory routing flow; it does not replace the existing local-first fallbacks.
