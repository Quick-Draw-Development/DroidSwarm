import { MessageBubble } from './MessageBubble';
import type { MessageRecord } from '../lib/types';

export function ChannelThread({ messages, username }: { messages: MessageRecord[]; username: string }) {
  return (
    <div className="thread-shell">
      {messages.length > 0 ? (
        messages.map((message) => <MessageBubble key={message.messageId} message={message} username={username} />)
      ) : (
        <p className="empty-copy">No channel history yet.</p>
      )}
    </div>
  );
}
