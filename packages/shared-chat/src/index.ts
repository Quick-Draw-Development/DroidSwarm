import type { TaskChatMessage } from '@shared-types';

export const dedupeChatMessages = (messages: TaskChatMessage[]): TaskChatMessage[] => {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key = `${message.source}:${message.externalMessageId ?? message.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
