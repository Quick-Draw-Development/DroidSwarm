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
- `DroidSwarm models discover` polls configured remote sources and records remote GGUF candidates as `discovered` until they are downloaded.
- `DroidSwarm models new` shows newly discovered models waiting for onboarding.
- `DroidSwarm models download <model-id>` downloads, validates, and activates a discovered model.
- Swarm startup refreshes inventory through orchestrator config loading.
- If model discovery is enabled, orchestrator startup also begins the optional discovery loop using the shared polling interval.
- Slave roll-call includes model inventory; the master merges that snapshot into the global registry.
- Slack supports `/droid models list`, `/droid models new`, `/droid models discover`, and `/droid models download <model-id>`.
- The dashboard exposes the shared inventory plus recently discovered models in the Models panel.

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

## Compatibility

`DROIDSWARM_MODEL_*` and `DROIDSWARM_LLAMA_*` remain valid fallbacks. Inventory-aware routing only overrides them when the shared registry has a better matching local model for the requested role.
