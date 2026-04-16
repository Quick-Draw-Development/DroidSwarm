export const buildMessageDedupeKey = (provider: string, externalMessageId: string): string =>
  `${provider}:${externalMessageId}`;
