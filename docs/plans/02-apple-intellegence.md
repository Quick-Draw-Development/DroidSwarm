Concise Implementation Plan for Codex Agent
Phase 1: Platform Detection & Model Router

Create packages/model-router (Nx library).
Add detectAppleSilicon() helper that checks process.platform === 'darwin' && process.arch === 'arm64'.
Implement chooseBackend(taskType, contextLength) logic (prefer Foundation Models → MLX → llama.cpp).
Update orchestrator and worker-host to use the new router instead of direct env-var checks.

Phase 2: Apple Foundation Models Bridge

Add dependency-free Node bridge (or minimal wrapper) to @apple/foundation-models / johnhenry/apple-foundation-models (or equivalent 2026 binding).
Replace the stub apple_intelligence_agent folder with real implementation supporting:
Tool/function calling
Structured JSON output
Conversation sessions with persistent memory

Hook into shared-tracing so every Apple Intelligence call is audit-logged.

Phase 3: Config, Dashboard & Polish

Add auto-enable logic in bootstrap and DroidSwarm setup.
Update CLI to respect DROIDSWARM_PREFER_APPLE_INTELLIGENCE.
Add dashboard panel showing live backend usage per agent.
Add graceful fallback: if Apple Intelligence unavailable, drop to MLX/llama.cpp with clear log.

Phase 4: Testing

Unit tests for router logic on darwin/arm64 vs other platforms.
End-to-end swarm test: confirm Apple Intelligence is used by default on Mac and handles tool calls + structured output correctly.
Performance benchmark: compare latency/throughput vs current llama.cpp setup.

Execution Notes for Codex Agent

Start with Phase 1 only and confirm before continuing.
Keep changes modular and fully backward-compatible (old env var still works).
No new heavy dependencies — prefer built-in Node + official Apple bindings.
This makes DroidSwarm the best possible Mac-native multi-agent system while staying lean and secure.

These updates turn the current stub into a first-class, maximally capable on-device intelligence layer that gives DroidSwarm a decisive edge on Apple hardware.