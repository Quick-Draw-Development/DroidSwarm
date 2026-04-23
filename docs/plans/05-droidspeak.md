# DroidSpeak enhancements - tightening.

## Objective
Introduce a highly concise internal communication language called Droidspeak (modeled directly after Asolaria’s Brown-Hilbert glyph system + verb envelopes).
This will drastically reduce token usage across all internal messages between the orchestrator, agents, worker pools, federation bus, tracing, and routing layers.
Core Rule (enforced everywhere):

The orchestrator and all agents only speak Droidspeak internally.
Any English input (Slack, dashboard, natural-language DMs, user prompts) is translated to Droidspeak before it reaches the orchestrator.
Any Droidspeak output from agents/orchestrator is translated back to natural English only at the final user-facing boundary (Slack bot, dashboard, logs).

This mirrors Asolaria’s glyph-sentence + Envelope design while fitting DroidSwarm’s EnvelopeV2, multi-project architecture, Apple Intelligence model-router, and shared packages.
Key Benefits

Massive token reduction (8-char glyphs replace verbose strings/JSON).
Deterministic routing and semantic alignment across agents.
Zero schema drift.
Seamless integration with future federation bus.

### Phase 0: Shared Droidspeak Package

Create new Nx library: packages/shared-droidspeak.
Add the following core modules:
catalogs.ts — predefined axes (D1=actor, D2=verb, D11=promotion, M-mode, etc.) modeled after Asolaria’s 47-dimensional Brown-Hilbert space.
glyph-generator.ts — function hilbertAddress(axis: string, value: any): string that produces 8-character glyphs.
droidspeak-encoder.ts — converts structured payload → glyph_sentence string.
droidspeak-decoder.ts — converts glyph_sentence → human-readable object (for debugging only).
translator.ts — bidirectional English ↔ Droidspeak (use model-router + Apple Intelligence for natural-language parsing on Mac).


Example Droidspeak Envelope (internal only):
TypeScript{
  id: "swarm-47-task-892",
  projectId: "proj-abc123",
  glyph_sentence: "D1:orch-01|D2:EVT-TASK-START|D11:PROMO-2|M-sync|PRJ:abc123",
  payload: "" // optional compressed blob
}
### Phase 1: Translator Layer (Boundary Enforcement)

Create packages/shared-droidspeak/src/translator-boundary.ts with two mandatory hooks:
toDroidspeak(input: string | object, context: {projectId, source: 'slack'|'dashboard'|'user'})
fromDroidspeak(droidspeakEnvelope: object, target: 'slack'|'dashboard'|'log')

Integrate the translator at these exact points (enforce via shared-routing):
Slack bot (apps/slack-bot): every incoming command/DM → toDroidspeak before routing.
Dashboard WebSocket / API layer: user input → toDroidspeak.
Orchestrator inbound queue: reject any non-Droidspeak message.
Outbound to Slack/Dashboard: every response → fromDroidspeak.
Audit logging (shared-tracing): store both raw Droidspeak and translated English (for human readability).


### Phase 2: Update EnvelopeV2 & Core Packages

Extend shared-routing and EnvelopeV2 to require glyph_sentence field (make it mandatory for all internal messages).
Update:
apps/orchestrator
Worker-host and all skill packs
packages/shared-persistence (store tasks/checkpoints in Droidspeak)
Future packages/federation-bus
Model-router (prompt Apple Intelligence / llama.cpp to output only Droidspeak internally)

Add validation middleware: any message without valid glyph_sentence is rejected with clear error.

### Phase 3: Vocabulary & Catalogs

Populate initial catalogs in shared-droidspeak (start small, expand iteratively):
Actors (D1): orch-01, worker-planner, worker-researcher, etc.
Verbs (D2): EVT-TASK-START, EVT-HANDOFF, EVT-CODE-EXEC, etc.
Modes (M-*): M-sync, M-async, M-review, M-federated.
Project tags, priority levels, etc.

Provide a droidspeak-vocabulary.md in the package for documentation and easy extension.

### Phase 4: Integration Points

Hook translator-boundary into:
Slack bot natural-language parser (Phase 4 of Slack plan).
Dashboard UI (convert displayed messages back to English).
Tracing/audit events (log both forms).

Add CLI flag / config: DROIDSWARM_ENABLE_DROIDSPEAK=true (default: true once implemented).
Update Apple Intelligence and local LLM prompts to enforce Droidspeak output for internal reasoning.

### Phase 5: Testing & Validation

Unit tests for encoder/decoder and translator round-tripping.
Integration tests: Slack command → internal Droidspeak → agent processes → English response in Slack.
Token usage benchmark: compare before/after on sample multi-turn tasks.
Verify zero English leaks into internal orchestrator/agent messages.
End-to-end test with multi-project and future federation.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
droidspeak: Phase X - [short description]
Reuse existing packages (shared-routing, model-router, shared-tracing, EnvelopeV2) wherever possible.
Keep Droidspeak fully optional during rollout (fallback to verbose English if flag is off).
Ensure Mac-native Apple Intelligence is used preferentially for translation where possible.
Maintain full backward compatibility for any existing English-only flows during transition.

This plan gives DroidSwarm the same token-efficient, glyph-optimized internal language that makes Asolaria’s federation scale so efficiently. All user-facing interfaces remain natural English while the core system speaks pure Droidspeak.