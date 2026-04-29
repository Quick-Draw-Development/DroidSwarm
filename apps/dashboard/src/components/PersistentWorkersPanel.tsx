'use client';

import { useState, useTransition } from 'react';

import type { PersistentWorkersSummary } from '../lib/types';

export function PersistentWorkersPanel({ workers }: { workers?: PersistentWorkersSummary }) {
  const [pending, startTransition] = useTransition();
  const [goal, setGoal] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!workers) {
    return null;
  }

  const startWorker = async () => {
    startTransition(async () => {
      const response = await fetch('/api/ralph', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Started Ralph session ${payload.session?.sessionId ?? ''}.`
        : (payload.error as string | undefined) ?? 'Unable to start Ralph worker.');
      if (response.ok) {
        setGoal('');
      }
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Persistent Workers</p>
        <span className="helper-text">
          {workers.activeCount} running · {workers.pausedCount} paused · {workers.completedCount} completed
        </span>
      </header>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Start Ralph Loop</p>
          <p className="subcopy">Launch a long-horizon refinement loop with fresh context windows on each pass.</p>
        </div>
        <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="persistent goal" />
        <button type="button" onClick={startWorker} disabled={pending || !goal.trim()}>
          Start Ralph
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {workers.sessions.map((session) => (
          <li key={session.sessionId} className="insight-item">
            <strong>{session.workerName}</strong>
            <span>
              {session.status} · {session.iterationCount}/{session.maxIterations}
              {session.engine ? ` · ${session.engine}` : ''}
              {session.routeKind ? ` · ${session.routeKind}` : ''}
            </span>
            <span>{session.goal}</span>
          </li>
        ))}
        {workers.sessions.length === 0 ? (
          <li className="insight-empty">No persistent Ralph worker sessions recorded yet.</li>
        ) : null}
      </ul>
    </article>
  );
}
