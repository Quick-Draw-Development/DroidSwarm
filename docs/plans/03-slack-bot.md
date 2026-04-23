DroidSwarm Slack Bot Implementation Plan
For Codex Agent Execution
Objective
Replace the old Blink-era chat bridge concept with a clean, secure, interactive Slack bot (`apps/slack-bot`) that allows remote management of multiple DroidSwarm projects and tasks. The bot will be fully aware of all registered projects, active swarms, and agent states, support both slash commands and natural-language DMs, and leverage Apple Intelligence (via the model-router) for intent parsing on Mac.
Key Goals

Active control (start/pause tasks, query status, launch swarms)
Multi-project visibility
Zero public exposure (Socket Mode only)
Secure token storage (macOS Keychain)
Full audit logging via shared-tracing
Optional feature (--enable-slack-bot)
Minimal footprint and no legacy Blink/Mux dependency

Prerequisites (Must Be Completed First)

Shared-tracing tamper-evident audit logging (from previous plan)
Model-router with strong Apple Intelligence preference on Mac (from Apple Intelligence plan)
Secure config/token helpers in packages/shared-config (Keychain support)

Phase 0: Setup

Add minimal dependency: @slack/bolt (only new package).
Extend packages/shared-config with secure token functions:TypeScriptgetSecureSlackToken(), setSecureSlackToken(token), getSecureAppToken()(Use macOS Keychain / @electron/remote or keytar equivalent if needed; prefer native APIs.)

Phase 1: Slack Bot Core
Create new Nx application: apps/slack-bot
Core files to implement:

apps/slack-bot/src/index.ts – main Bolt app with Socket Mode
apps/slack-bot/src/commands.ts – slash command handlers
apps/slack-bot/src/natural-language.ts – DM handler using model-router + Apple Intelligence

Key implementation details:
TypeScript// Basic structure
const app = new App({
  token: await getSecureSlackToken(),
  socketMode: true,
  appToken: await getSecureAppToken(),
});

app.command('/droid', async ({ command, ack, respond, client }) => {
  await ack();
  const result = await handleSlackCommand(command.text, command.user_id);
  await respond({ text: result.message, blocks: result.blocks });
  await tracer.audit('SLACK_COMMAND', { 
    command: command.text, 
    user: command.user_id, 
    result: result.type 
  });
});

// Natural language DM handler
app.message(async ({ message, say }) => {
  if (!isDirectMessage(message)) return;
  const intent = await modelRouter.parseIntent((message as any).text);
  const result = await executeIntent(intent);
  await say(result.response);
});
Supported commands (implement at least these):

/droid status → list all projects + active swarms + agent counts
/droid projects → detailed project list
/droid task start <project> <description>
/droid swarm pause/resume <swarm-id>
/droid agents → current agent status (will expand with federation)
/droid help

Phase 2: Multi-Project Awareness

Extend or create packages/shared-projects with:
listAllProjectsAndSwarms()
getProjectByNameOrPath(nameOrPath)
getSwarmStatus(swarmId)
executeTaskCommand(projectRoot, action, params)

Connect to shared-persistence for live queries.
Add event listeners from apps/orchestrator so the bot always reflects current state.

Phase 3: Managed Service Integration (Day 2)

Register slack-bot as a managed local service in packages/bootstrap:
Auto-start option via DroidSwarm swarm --enable-slack-bot
Config stored in project or global settings

Add CLI commands in packages/bootstrap:
DroidSwarm slack init (interactive setup: create Slack app, store tokens securely)
DroidSwarm slack status
DroidSwarm slack restart

Update main orchestrator startup to optionally launch the Slack bot.

Phase 4: Polish, Dashboard & Apple Intelligence Synergy 

Use the model-router so natural-language commands are parsed preferentially with Apple Intelligence on Mac.
Add rich Slack Block Kit responses (cards, progress bars, agent lists).
Add dashboard panel in apps/dashboard showing Slack bot connection status and recent commands.
Implement safety gates:
Confirmation prompt for destructive actions
Rate limiting per user

Full audit logging for every interaction.

Phase 5: Testing & Validation

Unit tests for command parsing and routing
Integration tests: simulate Slack messages → verify correct action + audit entries
End-to-end test on Mac: /droid status and natural-language task creation
Security checks: confirm tokens never written in plain text, Socket Mode only
Verify graceful degradation if Slack bot is disabled

Execution Instructions for Codex Agent

Follow phases strictly in order. Commit after each phase with message:
slack-bot: Phase X - [short description]
Keep all new code modular and behind the --enable-slack-bot flag (zero overhead when disabled).
Reuse existing shared packages (shared-tracing, shared-persistence, model-router, shared-routing) wherever possible.
Total estimated new code: 400–700 lines.
Do not add any other new dependencies beyond @slack/bolt.
Ensure everything remains Mac-friendly and local-first.

This plan delivers exactly the remote Slack management experience you want — active, secure, multi-project aware, and deeply integrated with Apple Intelligence and the rest of the DroidSwarm ecosystem.
Start with Phase 0 and Phase 1. Let me know when you need any part expanded with more code snippets.DroidSwarm Slack Bot Implementation Plan
