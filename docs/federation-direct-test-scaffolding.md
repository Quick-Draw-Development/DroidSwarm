# Direct Federation Test Scaffolding

This repository now includes bounded test scaffolding for direct federation coverage in:

- `packages/federation-bus`
- `packages/federation-adb`
- `apps/socket-server`

The scaffolding is intentionally test-only. It does not change orchestrator or bootstrap runtime behavior.

## Coverage shape

`packages/federation-bus/src/direct-federation.spec.ts` validates:

- direct peer forwarding between local bus instances
- duplicate suppression on repeated envelope delivery
- bounded fan-in from multiple heartbeats
- retention-window behavior for a small scale-validation fixture

`packages/federation-adb/src/service.spec.ts` validates:

- supervisor HTTP responses against a fake `adb` binary
- per-device manifest generation for multi-device onboarding fixtures

`apps/socket-server/src/federation-direct.spec.ts` validates:

- local message publication into the federation bus
- relay of remote federated envelopes into local rooms
- self-originated envelope suppression during polling

## Verification commands

Use the repo-standard Nx targets:

```bash
npx nx test federation-bus
npx nx test federation-adb
npx nx test socket-server
npx nx typecheck socket-server
```

## Scale validation notes

The current scale fixture is deliberately bounded so it remains stable in local CI:

- `federation-bus` uses 8 synthetic peers and 30 envelopes with a retention window of 25.
- `federation-adb` uses 4 synthetic device manifests.
- `socket-server` uses seam-level federation polling and publish checks rather than a full websocket fanout harness.

If larger-scale validation is needed later, expand the fixture counts first and keep the same assertions:

- peer registration count
- recent event retention window
- latest sequence advancement
- self-loop suppression on socket-server federation polling
