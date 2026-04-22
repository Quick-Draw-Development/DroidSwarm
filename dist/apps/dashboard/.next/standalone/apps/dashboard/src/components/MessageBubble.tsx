import { translateDroidspeak, translateDroidspeakV2 } from '../lib/droidspeak';
import type { MessageRecord } from '../lib/types';

export function MessageBubble({ message, username }: { message: MessageRecord; username: string }) {
  const compression = message.payload.compression as { scheme?: string; compressed_content?: string } | undefined;
  const structuredState = (
    message.payload.droidspeak
    ?? (message.payload.payload as { droidspeak?: unknown } | undefined)?.droidspeak
    ?? (message.payload.envelope_v2 as { body?: { droidspeak?: unknown } } | undefined)?.body?.droidspeak
  ) as { compact?: string; expanded?: string; kind?: string } | undefined;
  const translation = structuredState?.compact && structuredState?.expanded && typeof structuredState.kind === 'string'
    ? translateDroidspeakV2({
      compact: structuredState.compact,
      expanded: structuredState.expanded,
      kind: structuredState.kind as Parameters<typeof translateDroidspeakV2>[0]['kind'],
    })
    : (compression?.scheme === 'droidspeak-v1' || compression?.scheme === 'droidspeak-v2') && compression.compressed_content
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
          {translation.badgeLabel ? (
            <div className="droidspeak-chip-row">
              <span className="droidspeak-chip">{translation.badgeLabel}</span>
              <code className="droidspeak-compact">{translation.compact ?? structuredState?.compact ?? compression?.compressed_content}</code>
            </div>
          ) : null}
          <p className="translation-copy">{translation.translation}</p>
          {translation.unknownTokens.length > 0 ? (
            <p className="translation-warning">
              Untranslated: {translation.unknownTokens.join(', ')}
            </p>
          ) : null}
          {!translation.badgeLabel ? (
            <pre>{structuredState?.compact ?? compression?.compressed_content}</pre>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
