import { getSecureAppToken, getSecureSlackToken, resolveSlackKeychainService } from '@shared-config';

export interface SlackBotRuntimeConfig {
  enabled: boolean;
  botToken: string | null;
  appToken: string | null;
  keychainService: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  missingReason: string | null;
}

const parseEnabled = (): boolean => process.env.DROIDSWARM_ENABLE_SLACK_BOT === '1';

const parseLogLevel = (): SlackBotRuntimeConfig['logLevel'] => {
  const value = process.env.DROIDSWARM_SLACK_LOG_LEVEL;
  switch (value) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value;
    default:
      return 'info';
  }
};

export const loadSlackBotRuntimeConfig = (): SlackBotRuntimeConfig => {
  const enabled = parseEnabled();
  const botToken = getSecureSlackToken();
  const appToken = getSecureAppToken();
  let missingReason: string | null = null;

  if (enabled) {
    if (!botToken) {
      missingReason = 'Missing Slack bot token. Set DROIDSWARM_SLACK_BOT_TOKEN or store it in macOS Keychain.';
    } else if (!appToken) {
      missingReason = 'Missing Slack app token. Set DROIDSWARM_SLACK_APP_TOKEN or store it in macOS Keychain.';
    }
  }

  return {
    enabled,
    botToken,
    appToken,
    keychainService: resolveSlackKeychainService(),
    logLevel: parseLogLevel(),
    missingReason,
  };
};
