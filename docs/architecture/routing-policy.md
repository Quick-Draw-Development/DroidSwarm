# Routing Policy

Local-first remains the default doctrine.

- `local-cheap`: planner, research, review, checkpoint-compression, and orchestrator-reasoning roles.
- `local-capable`: bounded implementation and shell-heavy helpers.
- `apple-intelligence` engine: first-class local agent for Apple ecosystem work.
- `cloud`: only selected when task policy explicitly allows escalation.

Routing telemetry persists `modelTier`, `queueDepth`, and `fallbackCount` so operators can audit local-first behavior after the fact.

## Decision rules

1. If the role or task scope clearly targets Apple ecosystem work, use the local `apple-intelligence` engine.
   Apple signals include roles or task text mentioning `apple`, `ios`, `ipad`, `iphone`, `macos`, `swift`, `swiftui`, `objective-c`, `uikit`, `appkit`, `xcode`, `visionos`, `watchos`, or `tvos`.
2. If the role is planner/research/review/orchestrator/checkpoint-compression, use local llama.cpp as `local-cheap`.
3. If the task is coding or implementation but not Apple-specific, use local Codex CLI as `local-capable`.
4. Escalate to cloud only when:
   - the task matches explicit high-complexity hints such as `refactor`, `debug`, `multi-file`, `migration`, or `large-scale`
   - and task policy explicitly allows cloud use

## Config surface

- `DROIDSWARM_MODEL_PLANNING`
- `DROIDSWARM_MODEL_VERIFICATION`
- `DROIDSWARM_MODEL_CODE`
- `DROIDSWARM_MODEL_APPLE`
- `DROIDSWARM_MODEL_DEFAULT`
- `DROIDSWARM_ROUTING_PLANNER_ROLES`
- `DROIDSWARM_ROUTING_APPLE_ROLES`
- `DROIDSWARM_ROUTING_APPLE_HINTS`
- `DROIDSWARM_ROUTING_CODE_HINTS`
- `DROIDSWARM_ROUTING_CLOUD_HINTS`
