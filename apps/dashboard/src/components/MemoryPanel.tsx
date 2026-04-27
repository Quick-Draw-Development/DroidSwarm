'use client';

import { useState, useTransition } from 'react';

import type { LongTermMemorySummary } from '../lib/types';

export function MemoryPanel({ memory }: { memory?: LongTermMemorySummary }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!memory) {
    return null;
  }

  const search = async () => {
    startTransition(async () => {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: query.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage((payload.error as string | undefined) ?? 'Memory search failed.');
        return;
      }
      const resultText = Array.isArray(payload.results) && payload.results.length > 0
        ? payload.results
          .map((entry: { memoryType: string; englishTranslation: string }) => `${entry.memoryType}: ${entry.englishTranslation}`)
          .join(' | ')
        : 'No matching memory entries.';
      setMessage(resultText);
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Long-Term Memory</p>
        <span className="helper-text">{memory.totalCount} recent entries</span>
      </header>
      <p className="helper-text">
        pattern {memory.patternCount} · procedural {memory.proceduralCount}
      </p>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Search Memory</p>
          <p className="subcopy">Search durable memories before sending new work through the swarm.</p>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="memory search query" />
        <button type="button" onClick={search} disabled={pending || !query.trim()}>
          Search memory
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {memory.recent.map((entry) => (
          <li key={entry.memoryId} className="insight-item">
            <strong>{entry.memoryType}</strong>
            <span>{entry.englishTranslation}</span>
          </li>
        ))}
        {memory.recent.length === 0 ? (
          <li className="insight-empty">No long-term memory entries recorded yet.</li>
        ) : null}
      </ul>
    </article>
  );
}
