DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.DroidSwarm OpenMythos Integration Plan
For Codex Agent Execution
Objective
Incorporate OpenMythos (the open-source Recurrent-Depth Transformer from kyegomez/OpenMythos, April 2026) as a first-class deep-reasoning cognitive backend inside DroidSwarm.
It becomes selectable by the model-router, fully governed by shared-governance, observable via shared-tracing and drift checks, and available across the entire federation (master + slaves).
OpenMythos provides recurrent-depth looped reasoning (Prelude → Recurrent Block → Coda, sparse MoE, adaptive computation) with built-in spectral-radius stability — exactly the kind of advanced recurrent engine we want for high-complexity tasks like code-review-agent reasoning, long-horizon planning, and self-evolution loops.
Key Principles

Treated as another backend in model-router (Apple Intelligence → best llama.cpp → OpenMythos for deep/recurrent tasks).
All internal communication uses Droidspeak (new verbs: MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_DRIFT).
Spectral stability (ρ(A) < 1) is enforced as a new governance law (LAW-099).
Every OpenMythos call is logged tamper-evidently in shared-tracing.
Human approval + lightweight role-based consensus required for activation or critical tasks.
Federation-aware: slaves can host OpenMythos instances and report status back to master.
Minimal footprint — uses Python subprocess bridge (or official bindings) since OpenMythos is PyTorch-based.

Phase 0: New Mythos Engine Package

Create new Nx library: packages/mythos-engine.
Add OpenMythosAdapter.ts (mirrors the adapter pattern in the provided text):TypeScriptexport class OpenMythosAdapter {
  async run(task: { prompt: string; maxTokens?: number; loops?: number; temperature?: number }) { ... }
  async computeSpectralRadius() { ... }   // critical for LAW-099
  async checkDrift() { ... }
}
Include Python bridge (subprocess or PyNode) to load open-mythos package.

Phase 1: Model-Router & Inventory Integration

Extend packages/shared-models and model-inventory to detect and register OpenMythos (via pip install open-mythos check + metadata extraction).
Update model-router decision matrix:
New rule: deep_recurrent_reasoning → prefer OpenMythos when complexity > 0.7, multi-step, or high logical depth.
Fallback chain: Apple Intelligence → OpenMythos → best llama.cpp model.

Add OpenMythos to agent/skill manifests (e.g., code-review-agent can request it for deep analysis).

Phase 2: Governance — LAW-099 (Spectral Stability)

In shared-governance add LAW-099 (Spectral Stability of Recurrent Engines):
Evaluates spectralRadius returned by the adapter.
Actions: LOG / THROTTLE / HALT_AND_ROLLBACK if ρ(A) ≥ 1.0.

Hook into consensus engine: any task using OpenMythos automatically includes Guardian role review of stability metrics.
Update SYSTEM_LAWS.md with the new law.

Phase 3: Droidspeak Verbs & Federation

Extend Droidspeak catalog with:
MYTHOS_THINK, MYTHOS_LOOP, MYTHOS_STATUS, MYTHOS_DRIFT.

Update federation bus to broadcast OpenMythos status and drift signals across slaves.
Slaves can host their own OpenMythos instances and report spectral metrics to master.

Phase 4: Spawner, Orchestrator & UI Integration

Extend agent-builder and worker-host spawner to instantiate OpenMythosAdapter when selected.
Update orchestrator to pass tasks through the adapter with GAC/LAW-099 pre-check.
Add UI/CLI support:
Slack: /droid mythos status, /droid mythos loops <pid> <count>.
Dashboard: new “Cognitive Engines” panel showing OpenMythos instances, spectral radius, and loop counts.
CLI: DroidSwarm engines mythos bootstrap.


Phase 5: Bootstrap, Testing & Safety

Create scripts/bootstrap-mythos.mjs (one-command install + registration, similar to the provided text).
Add safety gates: GPU memory checks, loop limits, and automatic throttling.
Full tests:
Unit: adapter + spectral radius calculation.
Integration: OpenMythos used in code-review-agent → stability enforced.
Federation: slave runs OpenMythos → master observes drift.
Governance: high-loop task triggers LAW-099 and consensus.


Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
mythos-engine: Phase X - [short description]
Reuse existing packages (model-router, shared-models, shared-governance, shared-droidspeak, federation-bus, shared-tracing, orchestrator, agent-builder, Slack bot, dashboard) wherever possible.
Keep the feature optional and behind a flag (DROIDSWARM_ENABLE_MYTHOS=true).
Ensure everything remains Mac-friendly (Apple Silicon GPU support via PyTorch), local-first, and fully compliant with all laws.
After completion, update MODEL-ROUTING.md, SYSTEM_LAWS.md, and AGENTS.md with OpenMythos documentation and usage examples.

This plan directly adapts the clean, production-ready integration blueprint from the Asolaria text into DroidSwarm’s architecture, making OpenMythos a native, governed, recurrent deep-reasoning engine that enhances our code-review-agent, evolution loop, and high-complexity tasks without breaking any existing invariants.
Start with Phase 0.

## Completion

Completed on 2026-04-29.

Implemented:

- New `packages/mythos-engine` Nx library with a Python bridge, runtime registry, loop overrides, bootstrap support, spectral radius checks, and adapter tests.
- Shared model inventory and routing support for the `openmythos` backend, including optional runtime detection, role-aware selection, and OpenMythos preferences for deep-reasoning/code-review flows.
- Governance enforcement for LAW-099 spectral stability, plus Droidspeak Mythos verbs and Guardian-visible consensus around recurrent execution.
- Worker/orchestrator integration through a dedicated OpenMythos worker adapter with LAW-099 pre-checks and throttling/rollback behavior.
- Operator surfaces for `DroidSwarm engines mythos ...`, Slack Mythos commands, a dashboard Cognitive Engines panel, and `scripts/bootstrap-mythos.mjs`.
- Federation-compatible OpenMythos inventory snapshots via the shared model registry so slave nodes can report recurrent-engine state back to the master.

Validation completed with Nx typechecks/tests for the touched packages and `bash -n packages/bootstrap/bin/DroidSwarm`.
