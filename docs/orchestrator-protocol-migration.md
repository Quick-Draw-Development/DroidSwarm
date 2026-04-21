# Protocol and Migration Guide

`EnvelopeV2` is the canonical normalized transport. DroidSwarm still accepts legacy message envelopes and legacy execution-event names, but ingress normalizes them before persistence, dispatch, or dashboard consumption.

## Canonical EnvelopeV2 fields

- `id`
- `ts`
- `project_id`
- `swarm_id`
- `run_id`
- `task_id`
- `room_id`
- `agent_id`
- `role`
- `verb`
- `depends_on`
- `artifact_refs`
- `memory_refs`
- `risk`
- `body`

The shared source of truth lives in `packages/shared-types/src/index.ts`.

## Where normalization happens

- `apps/socket-server/src/protocol/validate.ts`
  - parses inbound client / worker traffic
  - normalizes legacy payloads into canonical top-level EnvelopeV2 fields
- `apps/orchestrator/src/protocol.ts`
  - normalizes inbound socket traffic before engine / worker runtime handling

The compatibility path stays additive: existing `MessageEnvelope` consumers still work, but their top-level `id`, `ts`, `verb`, references, and `body` now come from the normalized canonical envelope.

## Legacy mapping

- legacy `type` / `event_type` values map to compact verbs such as:
  - `plan_proposed -> plan.proposed`
  - `spawn_approved -> spawn.approved`
  - `checkpoint_created -> checkpoint.created`
  - `verification_completed -> verification.completed`
- native EnvelopeV2 messages without a legacy `type` are mapped back to the closest legacy message shape for compatibility with existing socket/orchestrator consumers

The raw event model is not removed. Runtime behavior still persists execution events, while `normalized_verb` and canonical transport/body data are stored alongside them for auditability.

## Continuity payloads

The migration now ships these durable continuity artifacts end to end:

- `TaskStateDigest`
- `HandoffPacket`
- routing telemetry (`modelTier`, `routeKind`, `queueDepth`, `fallbackCount`, `escalationReason`)

These artifacts appear in worker boot payloads, scheduler recovery, and dashboard task detail views.

## Current status

- complete:
  - canonical shared EnvelopeV2 contract
  - legacy normalization at ingress
  - digest / handoff persistence
  - routing telemetry propagation
  - dashboard canonical reads with legacy fallback
- still compatibility-only:
  - legacy message `type` remains in the runtime because the existing execution-event model is still authoritative for workflow transitions

## Verification

- `npx nx test orchestrator`
- `npx nx test socket-server`
- `npx nx typecheck dashboard`
