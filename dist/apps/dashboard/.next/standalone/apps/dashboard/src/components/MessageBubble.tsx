import { translateDroidspeak } from '../lib/droidspeak';
import type { MessageRecord } from '../lib/types';

export function MessageBubble({ message, username }: { message: MessageRecord; username: string }) {
  const compression = message.payload.compression as { scheme?: string; compressed_content?: string } | undefined;
  const translation =
    (compression?.scheme === 'droidspeak-v1' || compression?.scheme === 'droidspeak-v2') && compression.compressed_content
      ? translateDroidspeak(compression.compressed_content)
      : null;

  return (
    <article className={`message-bubble message-${message.messageType}`}>
      <header>
        <strong>{message.senderName}</strong>
        <span>{message.senderType}</span>
        <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
      </header>
      <p className={message.mentionTarget === username ? 'mention-highlight' : undefined}>{message.content}</p>
      {translation && translation.translation ? (
        <div className="translation-box">
          <p className="translation-copy">{translation.translation}</p>
          {translation.unknownTokens.length > 0 ? (
            <p className="translation-warning">
              Untranslated: {translation.unknownTokens.join(', ')}
            </p>
          ) : null}
          <pre>{compression?.compressed_content}</pre>
        </div>
      ) : null}
    </article>
  );
}
