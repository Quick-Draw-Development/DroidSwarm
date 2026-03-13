# Next.js Application Card – DroidSwarm Dashboard

This card defines the scaffolding for a local Next.js web application that acts as the human-facing interface for DroidSwarm.

## 1. Purpose & Scope
- Provide a Kanban-style board to visualize and manage tasks/issues
- Allow creation of new tasks that feed into the orchestrator
- Display real-time / historical channel (chat room) threads per task
- Serve as the single point of entry for human oversight, task addition, and review
- Operate as the UI for exactly one project-scoped DroidSwarm instance
- Surface orchestrator clarification requests to the human task creator and capture replies
- Provide lightweight MVP human identity via a cookie-backed username
- Visualize task trace and workflow state for human oversight
- Visualize runtime limit state such as token usage, rate-limit pressure, session age, and context pressure for human oversight
- Translate supported compressed agent shorthand into readable text for humans
- Run entirely locally (development & self-hosted mode)

## 2. Tech Stack & Requirements
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand (lightweight) or React Context + SWR / TanStack Query for data fetching
- **Real-time**: WebSocket client connecting to our custom server (ws://localhost:8765)
- **Data Source**:
  - Tasks/issues/channels/messages: Shared local SQLite database (via better-sqlite3 or drizzle-orm) for MVP persistence
  - Live updates: WebSocket events from the custom server
- **Authentication**: Shared-secret auth for privileged operator-room access in MVP
- **Human Identity (MVP)**:
  - Prompt for a username if no cookie is present
  - Store the username in a cookie for reuse on later visits
  - Validate the username in the text field so it contains lowercase letters, numbers, and underscores only
  - Use this username as the human identifier for task creation and clarification replies
- **Project Identity**: Receive configured `project_name` and normalized `project_id` from setup; use `project_id` in database and WebSocket interactions and `project_name` for display where useful
- **Runtime**: Node.js 20+, runs on localhost:3000

## 3. Project Structure (Recommended)
droidswarm-dashboard/
├── app/
│   ├── layout.tsx                # Root layout (nav, sidebar)
│   ├── page.tsx                  # Landing → redirect to /board
│   ├── board/
│   │   └── page.tsx              # Main Kanban board
│   ├── channels/
│   │   └── [taskId]/
│   │       └── page.tsx          # Channel viewer for a specific task/room
│   └── api/                      # Optional internal API routes (if needed)
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── KanbanBoard.tsx
│   ├── KanbanColumn.tsx
│   ├── TaskCard.tsx
│   ├── ChannelThread.tsx
│   ├── MessageBubble.tsx
│   ├── AddTaskModal.tsx
│   ├── AgentList.tsx
│   └── LiveConnectionStatus.tsx
├── lib/
│   ├── types.ts                  # Shared types (Task, Message, Agent, etc.)
│   ├── api.ts                    # Fetchers for tasks & orchestrator
│   ├── websocket.ts              # WebSocket client hook + message handlers
│   └── store.ts                  # Zustand store (tasks, active connections)
├── public/
│   └── (static assets)
├── hooks/
│   └── useWebsocket.ts
├── styles/
│   └── globals.css
├── .env.local
└── next.config.mjs


## 4. Core Pages & Features

### 4.0 Username Gate
- On first visit, if no username cookie exists, show a lightweight username prompt before entering the app
- Validate input as lowercase letters, numbers, and underscores only
- Persist the accepted username in a cookie
- Reuse the stored username as `created_by_user_id` for new tasks and as the identity for clarification responses
- Future notifications can build on this identity later; MVP only needs in-app mention visibility
### 4.1 Kanban Board (/board)
- **Layout**: 
  - Header: App name, search, “+ New Task” button (opens modal)
  - Sidebar: Filters (status, type, priority), simple stats (tasks in each column)
  - Main: Horizontal scrollable columns (To Do, Planning, In Progress, Review, Done, Cancelled)
- **Task Card**:
  - Title, ID, type badge (Bug/Feature), description preview
  - Agent count / status indicator
  - Mention/needs-response indicator when the orchestrator `@mentions` the creator
  - Guardrail-blocked / handoff-pending indicator when relevant
  - Last updated
  - “View Channel” button → navigates to /channels/[taskId]
- **Interactivity**:
  - Drag-and-drop between columns, including moving a task into `Cancelled`
  - Clicking card opens quick view or links to channel
  - Real-time updates: WebSocket subscription pushes task state changes
  - Highlight tasks that currently mention the cookie-backed username

### 4.2 Channel Viewer (/channels/[taskId])
- **Layout**:
  - Header: Back button, Task title & status, active agents list
  - Left sidebar: List of agents (name, role, last seen), export log button
  - Main: Scrollable message thread plus trace/handoff context for the task
- **Message Rendering**:
  - Agent name + role badge + timestamp
  - Different styling per type: chat (plain), proposal (highlighted box), vote (thumbs icons), artifact (code block with language highlighting)
  - Render `@mentions` distinctly, especially when the task creator is the target
  - If a message includes a supported compression scheme such as `droidspeak-v1`, render translated text by default with an option to view raw compressed text
  - Threaded replies (indentation or nested view)
  - Human input box at bottom for reply/clarification messages
  - Include a task action button so a human can move the task to `Cancelled` (or restore it) from the task view
- **Real-time**:
  - Connect to WebSocket on mount
  - Subscribe to room_id = taskId
  - Append new messages live
  - Show connection status (connected / reconnecting)
- **Fallback**:
  - Load historical messages from SQLite on first load

### 4.4 Workflow Visibility
- Show a compact task trace timeline for major orchestrator/agent events
- Show current guardrail state, including blocked/paused reasons
- Show recent handoffs between orchestrator, agents, and humans
- Show whether clarification is pending and who owns the next response

### 4.5 Limits & Health Visibility
- Show token usage rollups for the swarm and active task when available
- Show whether the orchestrator or task is near or over configured rate, token, or context thresholds
- Show last checkpoint time and session-summary freshness for active tasks
- Show retry/backoff state and whether the system has entered degraded execution mode
- Surface blocked states caused by limits distinctly from normal task blockers

### 4.3 Add New Task Modal
- Fields: Title, Description, Type (Bug / Feature / Task), Priority, Labels
- On submit:
  - Persist new task record to the shared SQLite database with `project_id`
  - Persist creator identity from the username cookie (`created_by_user_id`, `created_by_display_name`)
  - Move to “To Do” column
  - Publish `task_created` to privileged `operator` room
  - Wait for orchestrator ack via `task_intake_accepted`

## 5. Data Flow & Integration Points
- **Tasks**:
  - Source: Shared local SQLite database filtered by `project_id`
  - Creation flow: persist first in dashboard storage, then publish `task_created` to `operator`
  - Clarification flow: orchestrator emits a message with `@mention` targeting the stored username; the board highlights it and posts the user reply back into the task room
  - Sync: Use WebSocket push from orchestrator for task state changes
- **Channels**:
  - Live messages: WebSocket client subscribes to project-scoped rooms on page load
  - History: On load, fetch last N messages from SQLite filtered by `project_id`
- **Workflow State**:
  - Read trace summaries, guardrail events, handoff records, and session-derived status from SQLite
  - Read limit events, checkpoint metadata, and usage rollups from SQLite
  - Update the UI when orchestrator broadcasts task state changes tied to those records
- **Orchestrator Handshake**:
  - Dashboard joins privileged `operator` room as trusted client
  - App emits `task_created` after persistence
  - Orchestrator responds with `task_intake_accepted`
  - Orchestrator can push task updates → WebSocket broadcast
- **Logging/Audit**:
  - Operator-room events and channel messages are persisted server-side in SQLite
  - Mention targets and human clarification replies are persisted in the same task history
  - Traces, guardrail events, handoff records, limit events, and checkpoint state are available for UI inspection
  - UI shows “Export full log” → downloads JSONL export or renders summary from stored messages

## 6. MVP Milestones
1. Set up Next.js project + Tailwind + shadcn/ui
2. Build static Kanban board with mock data
3. Implement Add Task modal + local task storage
4. Add WebSocket connection + basic channel page
5. Wire real-time message display in channel view
6. Connect task cards to channel navigation
7. Add drag-and-drop + basic state sync

## 7. Future Extensions (Post-MVP)
- Real authentication / user accounts
- Rich task editing
- Agent performance dashboard
- Visual diff viewer for artifacts
- Integration with actual Linear/GitHub API
- Optional migration to PostgreSQL if multi-machine or hosted deployment outgrows SQLite

This scaffolding provides a solid, focused foundation that aligns with the orchestrator/agent cards and our WebSocket protocol. Once you approve or suggest adjustments, we can move to generating the initial code structure (package.json, key files, folder setup) or dive into a specific component first.
