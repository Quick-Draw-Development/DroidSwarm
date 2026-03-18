# AGENTS root instructions

Codex must honor these repository-level commands for common verification steps:

## Nx commands

- **Linting**: run `npx nx lint` to exercise all configured lint targets across apps and libs.
- **Type checking**: run `npx nx typecheck` to type-check all applicable projects (e.g., `apps/dashboard` and shared libs).
- **Testing**: run `npx nx test` to execute the full suite.
- **App-specific verification**:
  - `npx nx test orchestrator` validates the orchestrator’s Phase 10 end-to-end and unit coverage.
  - `npx nx typecheck dashboard` ensures the dashboard’s new persisted data views compile.
  - `npx nx test socket-server` (if available) checks socket-server behavior.

Whenever Codex needs to lint, typecheck, or test, it should use the above Nx commands unless the user explicitly requests something else.
