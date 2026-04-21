# Worker Contract

Workers consume a canonical boot payload and emit provider-neutral results. The orchestrator remains the workflow authority; workers only receive bounded continuity context and return execution outputs.

## Boot payload

Every worker launch now includes:

- task identity: `runId`, `taskId`, `attemptId`, `role`
- execution scope: `projectId`, `repoId`, `rootPath`, `branch`, `workspaceId`
- provider routing: `engine`, optional `model`, `modelTier`, `routingTelemetry`
- continuity state:
  - latest `TaskStateDigest`
  - latest `HandoffPacket`
  - `requiredReads`
  - compact verb dictionary (`CompactVerb -> description`)
- prompt context:
  - parent summary / parent checkpoint
  - resolved skill packs / instructions

Workers do not receive raw room replay by default. Continuity is digest-first and handoff-first.

## Canonical transport

`EnvelopeV2` is the canonical normalized transport for runtime coordination. The shared contract lives in `packages/shared-types/src/index.ts` and contains:

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

Legacy message shapes are still accepted, but ingress normalizes them before orchestrator dispatch or durable storage.

## Continuity artifacts

### TaskStateDigest

Durable task summary used for helper fanout and recovery:

- objective
- current plan
- decisions
- open questions
- active risks
- artifact index
- verification state
- updater
- timestamp
- optional structured `droidspeak-v2`

### HandoffPacket

Durable helper handoff:

- source task
- target task / role
- referenced digest id
- required reads
- summary
- timestamp
- optional structured `droidspeak-v2`

## Routing metadata

Local-first routing telemetry is propagated into worker boot and persisted on results / heartbeats:

- `modelTier`
- `routeKind`
- `queueDepth`
- `fallbackCount`
- `localFirst`
- `cloudEscalated`
- `escalationReason`

## Worker output

Workers still return provider-neutral `WorkerResult` and `WorkerHeartbeat` payloads. Runtime-specific adapters may emit legacy payloads internally, but the orchestrator normalizes those results before lifecycle handling and persistence.

When a worker emits transport messages over the socket path, those messages are normalized to `EnvelopeV2` compatibility fields before persistence or dispatch.

## Droidspeak

`droidspeak-v2` is bounded structured shorthand only. Supported state kinds are:

- `plan_status`
- `blocked`
- `unblocked`
- `handoff_ready`
- `verification_needed`
- `summary_emitted`
- `memory_pinned`

The dashboard prefers structured state objects when present and falls back to the legacy token-string translator only for old rows.

## Compatibility

- Legacy Codex results still normalize into `WorkerResult`.
- Legacy socket envelopes still normalize into `EnvelopeV2` compatibility fields.
- Existing execution-event persistence remains in place; digest/handoff rows extend it rather than replacing it.
