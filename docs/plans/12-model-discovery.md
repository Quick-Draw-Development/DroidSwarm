DroidSwarm Automatic Model Discovery & Onboarding Plan
For Codex Agent Execution
Objective
Build a robust, configurable model discovery system that automatically finds and inventories new GGUF-compatible models as they become available, then makes them immediately usable by the model-router and all agents/skills.
This extends the existing shared-models + model-inventory work so the swarm stays current with the latest high-quality models without manual intervention.
Recommended Resources to Monitor (Ranked by Value in 2026)
These are the most reliable, up-to-date, and automatable sources based on current ecosystem state:















































RankResourceWhy It's ExcellentHow to Monitor (Machine-Readable)Priority for DroidSwarm1Hugging Face Hub (GGUF models)Dominant source — almost every new model appears here within hours/days, quantized by top creators (unsloth, bartowski, mradermacher, etc.).Hugging Face API: https://huggingface.co/api/models?library=gguf&sort=last_modified (supports pagination, author filters, search).Highest2Specific trusted HF authors/collectionsHighest-quality quants appear first from known creators.Same HF API with author: bartowski, author: unsloth, author: mradermacher, etc. or specific collections.High3Local AI Zone / GGUF Loader aggregatorDaily-updated index of thousands of GGUF models with direct links.Simple web scrape or RSS-like feed from https://local-ai-zone.github.io/.Medium4Ollama LibraryVery popular curated list; easy to convert to GGUF.https://ollama.com/library API endpoint.Medium (as fallback)5llama.cpp GitHub discussions / releasesCommunity recommendations and official support announcements.GitHub API for issues/discussions in ggml-org/llama.cpp.Low (supplemental)
Recommendation: Start with Hugging Face API + a configurable list of trusted authors. This gives the best signal-to-noise ratio and is fully programmable.
Phase 0: Discovery Configuration & Service

Extend packages/shared-models with:
discovery-config.ts — configurable sources, trusted authors, filters (min size, quantization types, last-modified threshold), polling interval (default: every 6 hours, configurable via CLI/env).
model-discovery.ts — core service that polls sources and returns new/updated models.

Store discovery settings in the central registry (global + per-project overrides).

Phase 1: Hugging Face Discovery Engine

Implement fetchNewGGUFModels() using the official HF API:
Query with library=gguf, sort=last_modified, limit=100.
Filter for new models since last check (use lastModified timestamp).
Support author whitelisting/blacklisting.

Extract metadata automatically: model name, quantization, context length, size, tags.
Add optional web-scrape fallback for Local AI Zone aggregator.

Phase 2: Onboarding & User Flow

On discovery of new models:
Add to model-inventory with status discovered (not auto-downloaded).
Notify via Slack bot (/droid models new) and dashboard “New Models” banner.
Offer one-click approval: DroidSwarm models download <model-id> or auto-download small models (< 10 GB) if configured.

After download:
Run llama.cpp validation (quick load test).
Update model-router scoring matrix with new capabilities.
Broadcast inventory update to all federated slaves via federation bus.


Phase 3: Integration with Existing Systems

Hook discovery into:
Swarm startup / DroidSwarm update.
Background cron job (using existing orchestrator scheduler).
Model-router so newly onboarded models are immediately eligible for role-based selection.

Update Slack bot and dashboard:
/droid models discover (manual trigger).
/droid models list --new.
Dashboard tab showing “Recently Discovered” with approve/download buttons.

Governance tie-in: Any model marked “critical” (e.g., large reasoning models) triggers lightweight consensus before auto-onboarding.

Phase 4: Safety & Polish

Add safeguards:
Size limits and user approval gates for large models.
Checksum verification after download.
Quarantine suspicious models (e.g., no README or unusual tags).

Logging: Every discovery and onboarding action is recorded in shared-tracing with Droidspeak.
Configurable quiet mode for production swarms.

Phase 5: Testing & Validation

Unit tests for HF API parsing and filtering.
Integration test: simulate new model appearing on HF → verify it is discovered and added to inventory.
End-to-end: run discovery → approve a model → confirm it appears in model-router decisions for the code-review-agent and other roles.
Federation test: new model discovered on master → slaves receive inventory update.
Performance test: full discovery cycle completes in < 30 seconds.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
model-discovery: Phase X - [short description]
Reuse existing packages (shared-models, model-router, federation-bus, shared-tracing, orchestrator, Slack bot, dashboard) wherever possible.
Keep the feature fully configurable and optional (off by default until user enables it).
Ensure everything remains Mac-friendly, local-first, and compliant with all laws.
After completion, update documentation (MODEL-ROUTING.md) with the discovery sources and configuration examples.

This plan gives DroidSwarm a proactive, low-maintenance way to stay on the cutting edge of new GGUF models while integrating cleanly with the intelligent model-router and the rest of the swarm.
Start with Phase 0.

## Completion

Completed on 2026-04-27.

- Added discovery configuration and registry-backed settings storage with global and project-scoped overrides.
- Implemented remote GGUF discovery with Hugging Face as the primary source and optional Local AI Zone fallback parsing.
- Recorded remote candidates in the shared model registry as disabled `discovered` models until download and validation.
- Added manual discovery and onboarding flows through `DroidSwarm models discover|new|download`, Slack model discovery commands, and the dashboard Models panel.
- Added GGUF download validation, checksum enforcement support, quarantine handling, and audit logging for discovery and onboarding events.
- Hooked optional discovery polling into orchestrator startup and `DroidSwarm update` while keeping the feature off by default.
- Updated `MODEL-ROUTING.md` with discovery sources and configuration examples.
