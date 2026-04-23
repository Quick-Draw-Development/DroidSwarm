# Slack Bot

Minimal Slack bot scaffolding for DroidSwarm.

- Runs only when `DROIDSWARM_ENABLE_SLACK_BOT=1`.
- Reads the bot token from `DROIDSWARM_SLACK_BOT_TOKEN` or macOS Keychain.
- Reads the app token from `DROIDSWARM_SLACK_APP_TOKEN` or macOS Keychain.
- Uses the `DroidSwarm Slack` Keychain service by default. Override with `DROIDSWARM_SLACK_KEYCHAIN_SERVICE`.

Bootstrap wiring keeps this service optional. If tokens are missing, the daemon leaves the component disabled instead of failing the swarm.
