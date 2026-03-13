'use client';

import { useEffect, useState, useTransition } from 'react';

import { MessageBubble } from './MessageBubble';
import type { MessageRecord } from '../lib/types';

export function ProvideInstructionsModal({
  username,
  initialMessages,
}: {
  username: string;
  initialMessages: MessageRecord[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const refreshMessages = async (): Promise<void> => {
      const response = await fetch('/api/operator/messages', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = await response.json() as { messages?: MessageRecord[] };
      if (payload.messages) {
        setMessages(payload.messages);
      }
    };

    void refreshMessages();
    const intervalId = window.setInterval(() => {
      void refreshMessages();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  const sendInstruction = (): void => {
    if (!content.trim()) {
      return;
    }

    startTransition(async () => {
      setStatusText('Sending instruction...');
      const response = await fetch('/api/operator/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          content,
        }),
      });

      if (!response.ok) {
        setStatusText('Failed to send instruction.');
        return;
      }

      const payload = await response.json() as { dispatchStatus?: string };
      setContent('');
      setStatusText(
        payload.dispatchStatus === 'accepted'
          ? 'Instruction delivered to the orchestrator.'
          : payload.dispatchStatus === 'queued'
            ? 'Instruction queued for the operator room.'
            : 'Operator room is offline right now.',
      );

      window.setTimeout(async () => {
        const refreshed = await fetch('/api/operator/messages', { cache: 'no-store' });
        if (!refreshed.ok) {
          return;
        }

        const refreshedPayload = await refreshed.json() as { messages?: MessageRecord[] };
        if (refreshedPayload.messages) {
          setMessages(refreshedPayload.messages);
        }
      }, 400);
    });
  };

  return (
    <>
      <button className="secondary-button" type="button" onClick={() => setIsOpen(true)}>
        Provide Instructions
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
          <section
            className="operator-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Provide instructions to the orchestrator"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="operator-modal-header">
              <div>
                <p className="section-title">Operator Channel</p>
                <h2>Provide Instructions</h2>
                <p className="subcopy">Send project-level guidance to the orchestrator outside any task room.</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </header>

            <div className="operator-modal-thread">
              {messages.length > 0 ? (
                messages.map((message) => (
                  <MessageBubble key={message.messageId} message={message} username={username} />
                ))
              ) : (
                <p className="empty-copy">No operator-room messages yet.</p>
              )}
            </div>

            <div className="operator-modal-composer">
              <textarea
                rows={4}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Tell the orchestrator what to prioritize, investigate, or clarify."
              />
              <div className="operator-modal-actions">
                <p className="helper-text">{statusText ?? 'Messages stay in the operator room audit trail.'}</p>
                <button type="button" onClick={sendInstruction} disabled={isPending}>
                  {isPending ? 'Sending...' : 'Send Instruction'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
