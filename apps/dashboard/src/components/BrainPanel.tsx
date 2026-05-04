'use client';

import { useState, useTransition } from 'react';

import type { AgentBrainSummary } from '../lib/types';

export function BrainPanel({ brain }: { brain?: AgentBrainSummary }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!brain) {
    return null;
  }

  const runDream = async () => {
    startTransition(async () => {
      const response = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'dream' }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Dream cycle analyzed ${payload.result?.analyzedCount ?? 0} memories and staged ${payload.result?.candidateCount ?? 0} candidates.`
        : (payload.error as string | undefined) ?? 'Dream cycle failed.');
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Brain</p>
        <span className="helper-text">{brain.pendingCandidateCount} pending candidates</span>
      </header>
      <p className="helper-text">
        working {brain.workingCount} · episodic {brain.episodicCount} · semantic {brain.semanticCount} · personal {brain.personalCount}
      </p>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Dream Cycle</p>
          <p className="subcopy">Run the mechanical nightly clustering cycle immediately.</p>
        </div>
        <button type="button" onClick={runDream} disabled={pending}>
          Run dream
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {brain.candidates.map((candidate) => (
          <li key={candidate.candidateId} className="insight-item">
            <strong>{candidate.status}</strong>
            <span>{candidate.summary}</span>
          </li>
        ))}
        {brain.candidates.length === 0 ? (
          <li className="insight-empty">No brain promotion candidates are waiting for review.</li>
        ) : null}
      </ul>
    </article>
  );
}
