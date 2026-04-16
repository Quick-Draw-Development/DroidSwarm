import type { TaskChatSummary } from '../lib/types';

export function TaskChatPanel({ messages }: { messages: TaskChatSummary[] }) {
  return (
    <section>
      <h3>Task Chat</h3>
      <ul>
        {messages.map((message) => (
          <li key={message.id}>
            <strong>{message.authorId}</strong>: {message.body}
          </li>
        ))}
      </ul>
    </section>
  );
}
