import { App, LogLevel } from '@slack/bolt';
import { loadSlackBotRuntimeConfig } from './config';
import { handleSlackInput } from './service';

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

const isBotEvent = (message: Record<string, unknown>): boolean =>
  typeof message.bot_id === 'string'
  || message.subtype === 'bot_message';

const extractUserId = (message: Record<string, unknown>): string =>
  typeof message.user === 'string'
    ? message.user
    : typeof message.user_id === 'string'
      ? message.user_id
      : 'unknown-user';

const sanitizeSlackText = (text: string): string =>
  text.replace(/<@[^>]+>/g, '').trim();

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
    const response = await handleSlackInput({
      text: sanitizeSlackText(command.text ?? ''),
      userId: command.user_id,
      username: command.user_name ?? command.user_id,
      channelId: command.channel_id,
    }, config);
    await respond({ text: response.text, response_type: 'ephemeral' });
  });

  app.message(async ({ message, say }) => {
    const event = message as unknown as Record<string, unknown>;
    if (!isDirectMessage(event) || isBotEvent(event)) {
      return;
    }

    const response = await handleSlackInput({
      text: sanitizeSlackText(extractMessageText(event)),
      userId: extractUserId(event),
      username: extractUserId(event),
      channelId: typeof event.channel === 'string' ? event.channel : undefined,
      threadTs: typeof event.thread_ts === 'string' ? event.thread_ts : typeof event.ts === 'string' ? event.ts : undefined,
    }, config);
    await say(`Forwarded. ${response.text}`);
  });

  app.event('app_mention', async ({ event, say }) => {
    const mentionEvent = event as unknown as Record<string, unknown>;
    if (isBotEvent(mentionEvent)) {
      return;
    }
    const response = await handleSlackInput({
      text: sanitizeSlackText(extractMessageText(mentionEvent)),
      userId: extractUserId(mentionEvent),
      username: extractUserId(mentionEvent),
      channelId: typeof mentionEvent.channel === 'string' ? mentionEvent.channel : undefined,
      threadTs: typeof mentionEvent.thread_ts === 'string' ? mentionEvent.thread_ts : typeof mentionEvent.ts === 'string' ? mentionEvent.ts : undefined,
    }, config);
    await say(`Forwarded. ${response.text}`);
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
