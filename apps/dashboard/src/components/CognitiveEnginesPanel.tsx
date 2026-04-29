'use client';

import { useState, useTransition } from 'react';

import type { CognitiveEnginesSummary } from '../lib/types';

export function CognitiveEnginesPanel({ engines }: { engines?: CognitiveEnginesSummary }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!engines) {
    return null;
  }

  const bootstrapMythos = async () => {
    startTransition(async () => {
      const response = await fetch('/api/engines/mythos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bootstrap' }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Mythos ${payload.status?.engineId ?? 'runtime'} is ${payload.status?.status ?? 'updated'}.`
        : (payload.error as string | undefined) ?? 'Mythos bootstrap failed.');
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Cognitive Engines</p>
        <span className="helper-text">
          Mythos {engines.mythosEnabled ? 'enabled' : 'disabled'} · {engines.instances.length} instances
        </span>
      </header>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">OpenMythos</p>
          <p className="subcopy">Recurrent deep-reasoning runtime with LAW-099 spectral stability checks.</p>
        </div>
        <button type="button" onClick={bootstrapMythos} disabled={pending}>
          Bootstrap Mythos
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {engines.instances.map((entry) => (
          <li key={`${entry.nodeId}:${entry.modelId}`} className="insight-item">
            <strong>{entry.displayName}</strong>
            <span>{entry.nodeId} · {entry.status} · spectral {entry.spectralRadius?.toFixed(3) ?? 'n/a'} · loops {entry.loopCount ?? 0}</span>
          </li>
        ))}
        {engines.instances.length === 0 ? (
          <li className="insight-empty">No OpenMythos runtimes are registered.</li>
        ) : null}
      </ul>
    </article>
  );
}
