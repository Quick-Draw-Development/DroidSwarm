import { App, LogLevel } from '@slack/bolt';
import { loadSlackBotRuntimeConfig } from './config';
import { parseSlackCommand, renderSlackCommandResponse } from './commands';

const toBoltLogLevel = (level: 'debug' | 'info' | 'warn' | 'error'): LogLevel => {
  switch (level) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'warn':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    default:
      return LogLevel.INFO;
  }
};

const extractMessageText = (message: Record<string, unknown>): string => {
  const text = message.text;
  return typeof text === 'string' ? text : '';
};

const isDirectMessage = (message: Record<string, unknown>): boolean =>
  typeof message.channel_type === 'string' && message.channel_type === 'im';

export const startSlackBot = async (): Promise<App | null> => {
  const config = loadSlackBotRuntimeConfig();
  if (!config.enabled) {
    console.info('[slack-bot] disabled');
    return null;
  }

  if (!config.botToken || !config.appToken) {
    console.warn(`[slack-bot] ${config.missingReason ?? 'missing Slack configuration'}`);
    return null;
  }

  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    socketMode: true,
    logLevel: toBoltLogLevel(config.logLevel),
  });

  app.command('/droid', async ({ command, ack, respond }) => {
    await ack();
    const parsed = parseSlackCommand(command.text ?? '');
    const response = renderSlackCommandResponse(parsed);
    await respond({ text: response.text, response_type: 'ephemeral' });
  });

  app.message(async ({ message, say }) => {
    const event = message as unknown as Record<string, unknown>;
    if (!isDirectMessage(event)) {
      return;
    }

    const parsed = parseSlackCommand(extractMessageText(event));
    const response = renderSlackCommandResponse(parsed);
    await say(response.text);
  });

  await app.start();
  console.info(`[slack-bot] running with keychain service "${config.keychainService}"`);
  return app;
};

if (require.main === module) {
  void startSlackBot().catch((error: unknown) => {
    console.error('[slack-bot] failed to start', error);
    process.exitCode = 1;
  });
}
