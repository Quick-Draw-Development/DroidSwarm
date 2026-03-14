'use client';

import { useCallback, useState, type FormEvent } from 'react';

import { ChannelThread } from './ChannelThread';
import type { MessageRecord } from '../lib/types';

type ChannelRoomProps = {
  taskId: string;
  username?: string;
  initialMessages: MessageRecord[];
};

type ChannelReplyFormProps = {
  disabled: boolean;
  onSubmit: (content: string) => Promise<void>;
};

export function ChannelRoom({ taskId, username, initialMessages }: ChannelRoomProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSend = useCallback(
    async (content: string) => {
      if (!username || !content.trim()) {
        return;
      }
      setSending(true);
      setFeedback(null);
      try {
        const response = await fetch(`/api/channels/${taskId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, content: content.trim() }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? 'Failed to post message.');
        }
        const payload = await response.json();
        if (payload?.message) {
          setMessages((current) => [...current, payload.message]);
        }
        setFeedback(payload?.dispatchStatus ? `Dispatch status: ${payload.dispatchStatus}` : null);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Failed to post your reply.');
      } finally {
        setSending(false);
      }
    },
    [taskId, username],
  );

  return (
    <>
      <ChannelThread messages={messages} username={username ?? ''} />
      <div className="reply-box">
        {username ? (
          <>
            <ChannelReplyForm onSubmit={handleSend} disabled={sending} />
            {feedback ? <p className="reply-feedback">{feedback}</p> : null}
          </>
        ) : (
          <>
            <p className="section-title">Human Reply</p>
            <p className="subcopy">Log in to join the discussion and send instructions to the task room.</p>
          </>
        )}
      </div>
    </>
  );
}

function ChannelReplyForm({ disabled, onSubmit }: ChannelReplyFormProps) {
  const [value, setValue] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!value.trim()) {
        setIsDirty(true);
        return;
      }
      await onSubmit(value.trim());
      setValue('');
      setIsDirty(false);
    },
    [onSubmit, value],
  );

  return (
    <form className="reply-form" onSubmit={handleSubmit}>
      <label htmlFor="channel-reply" className="section-title">
        Human Reply
      </label>
      <textarea
        id="channel-reply"
        className="reply-input"
        placeholder="Post a quick update, ask a question, or confirm a next action for the orchestrator."
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setIsDirty(true);
        }}
        disabled={disabled}
        rows={4}
      />
      <div className="reply-actions">
        <span className="helper-text">
          {disabled ? 'Sending your reply…' : isDirty && !value.trim() ? 'Need some content before sending.' : 'Your reply posts to the task channel.'}
        </span>
        <button className="reply-submit" type="submit" disabled={disabled || !value.trim()}>
          {disabled ? 'Sending…' : 'Send Reply'}
        </button>
      </div>
    </form>
  );
}
