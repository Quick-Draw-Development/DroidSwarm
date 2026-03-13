# WebSocket Server Card – Agent Communication Hub

Central real-time server for inter-agent messaging in task-specific rooms. Implements the protocol we defined (auth, message types, room isolation, heartbeat, logging).

## 1. Purpose & Scope
- Serve exactly one project-scoped DroidSwarm instance in MVP
- Manage multiple isolated rooms (one per task/issue)
- Manage one privileged control-plane room (`operator`) for task intake
- Handle agent authentication & naming enforcement
- Broadcast messages within rooms (pub/sub)
- Persist every message + connection event for audit trail
- Support orchestrator as privileged observer
- Run locally or in container (low resource footprint)

## 2. Tech Stack & Requirements
- **Runtime**: Node.js 20+ (ESM)
- **Language**: TypeScript 5+
- **WebSocket Library**: `ws` (lightweight & battle-tested)
- **Logging**: `pino` for application logs
- **Persistence (MVP)**: Shared local SQLite database used by the socket server and dashboard
  - Store rooms/channels, messages, connection events, and task intake events
  - Include `project_id` on all persisted records
  - Support persistence for traces, spans, guardrail events, handoff records, and session metadata
  - Enable WAL mode for local concurrency
- **Utilities**:
  - `uuid` → generate message_ids & connection_ids
  - `zod` → runtime validation of incoming messages
- **Dev Tools**:
  - `tsx` or `ts-node` for running
  - `nodemon` / `tsx watch` for hot reload
  - ESLint + Prettier

## 3. Project Structure (Recommended)
agent-websocket-server/
├── src/
│   ├── index.ts                  # Entry point – starts server
│   ├── server.ts                 # WebSocket server setup & lifecycle
│   ├── types.ts                  # Core types (Message, AuthPayload, etc.)
│   ├── protocol/
│   │   ├── validate.ts           # Zod schemas + validation helpers
│   │   └── messages.ts           # Message type constants + builders
│   ├── rooms/
│   │   ├── RoomManager.ts        # Manages room state, connections, broadcast
│   │   └── Room.ts               # Per-room logic (clients, name uniqueness)
│   ├── auth/
│   │   └── authenticate.ts       # Auth logic (token check, name uniqueness)
│   ├── db/
│   │   ├── client.ts             # SQLite connection + pragmas
│   │   ├── schema.ts             # Table definitions / migrations
│   │   └── repositories.ts       # Message/task/channel persistence helpers
│   ├── logging/
│   │   ├── Logger.ts             # Pino instance for server logs
│   │   └── audit.ts              # Helpers to persist connection/message events
│   └── orchestrator/
│       └── privileged.ts         # Optional: special handling for Orchestrator client
├── data/
│   └── droidswarm.db             # Created at runtime (git ignored)
├── config/
│   └── default.ts                # Ports, secrets, log path, etc.
├── .env
├── tsconfig.json
├── package.json
└── README.md


## 4. Core Features & Implementation Notes

### 4.1 Server Setup
- Listen on `ws://localhost:8765` (configurable via env)
- Receive configured `project_name` and `project_id` at startup and scope all persistence to `project_id`
- Upgrade from HTTP → WebSocket
- Handle connection close / errors gracefully

### 4.2 Authentication Flow
- On connect → wait for first message (must be type: "auth")
- Validate with Zod:
  - room_id, agent_name, agent_role, optional token
- Enforce name uniqueness per room
- Require privileged auth/token for joining `operator`
- On success → assign to room, send `auth_response: success`
- On failure → send error & close (code 1008)

### 4.3 Room Management
- RoomManager singleton:
  - Map<roomId, Room>
  - Create room on first auth (lazy init)
  - Destroy room when empty + task done (manual trigger for MVP)
- Per Room:
  - Set of connected clients (WebSocket + metadata: name, role, id)
  - Enforce unique names
  - Broadcast method (send to all except optional exclude)

### 4.4 Message Handling
- After auth → parse every incoming message with Zod
- Supported types: chat, proposal, vote, request_help, status_update, artifact, heartbeat, `task_created`, `task_intake_accepted`, `clarification_request`, `clarification_response`, `handoff_event`, `guardrail_event`, `trace_event`, etc.
- Persist message BEFORE broadcast
- Prefer compact typed payloads that can be processed without natural-language parsing
- Handle special types:
  - `request_help` → log prominently (orchestrator can poll logs or connect as observer)
  - `task_created` → allowed only in privileged `operator` room
  - `task_intake_accepted` → orchestrator ack for accepted task intake
  - `clarification_request` → may include `mentions` metadata targeting the task creator
  - `clarification_response` → human reply linked to the clarification thread
  - `handoff_event` → links delegated work between orchestrator, agents, and humans
  - `guardrail_event` → records pass/fail/tripwire outcomes for workflow checks
  - `trace_event` → records trace/span lifecycle information when emitted through the server
  - `heartbeat` → update last seen, no broadcast
- Reply threading via `reply_to` (client-side rendering)

### 4.5 Protocol Shape
- Common envelope fields:
  - `message_id`
  - `project_id`
  - `room_id`
  - `task_id`
  - `type`
  - `from`
  - `timestamp`
  - `payload`
- Payloads should prefer:
  - IDs / references
  - enums / reason codes
  - compact metadata
  - optional `content` only when natural language is actually needed
- Example operational types:
  - `status_update`
  - `request_help`
  - `handoff_event`
  - `guardrail_event`
  - `artifact`
  - `proposal`
  - `vote`
  - `clarification_request`
  - `clarification_response`

### 4.6 Logging & Auditing
- Pino logger with:
  - Pretty in dev, JSON in prod
  - Structured app logs to stdout/file as needed
- SQLite audit tables store:
  - `project_id` on all rows
  - rooms/channels
  - messages
  - mention targets / clarification thread linkage
  - human username identifiers attached to task creation and clarification replies
  - sessions, traces, spans, handoff records, and guardrail events
  - connect, auth_success, auth_fail, disconnect, and error events
- JSONL export can be generated from SQLite for debugging or archival
### 4.7 Orchestrator Privileges

Allow special agent_name: "Orchestrator"
Optional: privileged flag in auth → can send system messages (e.g., spawned_agent)
Can join any room without counting toward uniqueness
`operator` room is restricted to privileged clients only (for MVP: dashboard + orchestrator)

## 5. MVP Milestones

Basic server setup (listen, accept connections)
Auth flow + room creation
Simple broadcast of chat messages
Shared SQLite persistence for tasks, channels, messages, and audit events
Session/tracing/guardrail/handoff persistence
Zod validation for all message types
Compact typed message protocol for agent coordination
Heartbeat detection & stale client cleanup
Orchestrator join & system message support
Privileged `operator` room with `task_created` / `task_intake_accepted`

## 6. Security & Reliability Notes

 Shared-secret auth for privileged clients in MVP
Rate limit: 10 msg/s per client (simple counter)
Connection timeout: close after 90s no heartbeat
Graceful shutdown: close all connections, flush logs
Error safety: try-catch around every handler

## 7. Future Extensions

Redis pub/sub for clustered mode
PostgreSQL for multi-machine deployment if SQLite is outgrown
Rate limiting / anti-spam
TLS (wss://) for production
Prometheus metrics (connections, msg rate, latency)
