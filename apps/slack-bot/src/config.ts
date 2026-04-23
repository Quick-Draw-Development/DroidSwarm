import { detectAppleSilicon, detectMlxRuntime } from '@model-router';
import { getSecureAppToken, getSecureSlackToken, resolveSlackKeychainService } from '@shared-config';

export interface SlackBotRuntimeConfig {
  enabled: boolean;
  botToken: string | null;
  appToken: string | null;
  operatorToken: string | null;
  keychainService: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  missingReason: string | null;
  defaultProjectId: string;
  preferAppleIntelligence: boolean;
  appleRuntimeAvailable: boolean;
  mlxAvailable: boolean;
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
  const operatorToken = process.env.DROIDSWARM_OPERATOR_TOKEN ?? null;
  const preferAppleIntelligence = detectAppleSilicon(process.platform, process.arch);
  const appleRuntimeAvailable = process.env.DROIDSWARM_APPLE_INTELLIGENCE_ENABLED !== '0';
  const mlxAvailable = detectMlxRuntime({
    enabled: process.env.DROIDSWARM_MLX_ENABLED === '1',
    baseUrl: process.env.DROIDSWARM_MLX_BASE_URL,
    model: process.env.DROIDSWARM_MODEL_MLX,
  });
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
    operatorToken,
    keychainService: resolveSlackKeychainService(),
    logLevel: parseLogLevel(),
    missingReason,
    defaultProjectId: process.env.DROIDSWARM_PROJECT_ID ?? 'droidswarm',
    preferAppleIntelligence,
    appleRuntimeAvailable,
    mlxAvailable,
  };
};
