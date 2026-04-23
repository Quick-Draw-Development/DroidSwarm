DroidSwarm Llama.cpp Model Inventory & Intelligent Selection Plan
For Codex Agent Execution
Objective
Enhance the existing llama.cpp integration so that:

All available models are automatically discovered, inventoried, and registered into the central system on every install, update, or swarm start.
The model-router makes intelligent, context-aware decisions about which model to assign to each agent role and use case (e.g., code-review-agent vs. researcher vs. planner).

This ensures optimal performance, cost (zero), and capability usage while staying fully compliant with Droidspeak, governance, tracing, and federation rules.
Key Principles

Model inventory lives in the central registry (registry.db + per-node cache).
Every agent/skill manifest can declare model preferences (reasoning depth, context length, speed, tool-use capability).
Model-router prefers Apple Intelligence on Mac, then intelligently falls back to the best llama.cpp model.
All model choices are logged to shared-tracing (tamper-evident) and can be audited.
Slaves automatically sync their local model inventory to the master on connection.

Phase 0: Model Inventory Service

Create packages/shared-models (new Nx library).
Add model-inventory.ts that:
Scans the llama.cpp model directory (~/.droidswarm/models/ or configured path).
Extracts metadata: filename, size, quantization (Q4_K_M, etc.), context length, supported features.
Stores inventory in registry.db table models (nodeId, modelName, metadata, lastSeen, enabled).

Hook the inventory into the install script and bootstrap process so it runs automatically on install-droidswarm.sh, DroidSwarm update, and swarm startup.

Phase 1: Enhanced Model-Router

Extend packages/model-router with:
loadModelInventory() that pulls from shared-models.
selectModelForRole(role: string, useCase: string, requirements: {contextLength, speedPriority, reasoningDepth, toolUse}).

Define a clear decision matrix (in code + documented in MODEL-ROUTING.md):
code-review-agent → strong reasoning + code understanding model (e.g., deepseek-coder or qwen2.5-coder).
planner/researcher → balanced high-reasoning model with large context.
fast agents (verifier, guardian) → smaller, faster quantized models.
Apple Intelligence always takes priority on darwin/arm64 when it meets requirements.
Fallback logic with scoring (reasoning score × speed score × context fit).

Add dynamic reloading: if new models appear, inventory updates and router re-evaluates.

Phase 2: Agent & Skill Integration

Extend agent manifests and skill manifests to support optional modelPreferences field.
Update agent-builder and shared-skills registry so every specialized agent (including the new code-review-agent) declares its needs.
Orchestrator and worker-host now request models via modelRouter.selectModelForRole() instead of hard-coded env vars.

Phase 3: Federation & Slave Support

Extend federation bus to broadcast model inventory changes.
On slave onboarding / heartbeat:
Slave sends its local inventory to master.
Master merges into global view.

Router can now consider node-specific models when assigning tasks across the swarm.

Phase 4: Tracing, Governance & User Interfaces

Log every model selection to shared-tracing with Droidspeak (EVT-MODEL-SELECTED) and full metadata.
Add governance compliance check: any model change that affects critical agents triggers a lightweight consensus round.
Update:
Slack bot: /droid models list, /droid models refresh.
Dashboard: new “Models” tab showing inventory per node and current routing decisions.
CLI: DroidSwarm models refresh, DroidSwarm models status.


Phase 5: Testing & Validation

Unit tests for inventory scanning and model selection scoring.
Integration tests: install new model → verify it appears in registry → router assigns it correctly to roles.
End-to-end: trigger code-review-agent on a PR → confirm it used the intended model.
Federation test: onboard a slave with different models → verify master sees them and routes tasks appropriately.
Performance test: ensure model selection adds < 50 ms overhead.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
llama-models: Phase X - [short description]
Reuse existing packages (model-router, shared-models (new), shared-skills, agent-builder, federation-bus, shared-tracing, orchestrator, Slack bot, dashboard) wherever possible.
Keep all changes modular and fully backward-compatible (existing env var DROIDSWARM_MODEL_* still works as fallback).
Ensure everything remains Mac-friendly, local-first, and compliant with all laws.
After completion, update documentation (MODEL-ROUTING.md and AGENTS.md) with the model decision matrix and usage examples.

This plan makes llama.cpp model management fully automatic and intelligent, giving every agent the best available model for its role and workload while staying tightly integrated with the rest of the DroidSwarm ecosystem.
Start with Phase 0.