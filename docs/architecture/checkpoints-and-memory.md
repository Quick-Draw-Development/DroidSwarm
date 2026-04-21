# Checkpoints And Memory

Existing task checkpoints remain intact. Worker checkpoint deltas are merged into project facts, decisions, and project checkpoints for future resume packets.

The continuity layer now adds:

- `TaskStateDigest`: the durable summary handed to helpers and used during recovery.
- `HandoffPacket`: the digest-linked handoff that lists required reads for the next helper.

Recovery prefers digests and handoff packets over raw room replay.
