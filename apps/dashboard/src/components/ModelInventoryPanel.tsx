'use client';

import { useState, useTransition } from 'react';

import type { ModelInventorySummary } from '../lib/types';

export function ModelInventoryPanel({ inventory }: { inventory?: ModelInventorySummary }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!inventory) {
    return null;
  }

  const refreshInventory = async () => {
    startTransition(async () => {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Refreshed ${payload.snapshot?.models?.length ?? 0} models for ${payload.snapshot?.nodeId ?? 'local-node'}.`
        : (payload.error as string | undefined) ?? 'Model refresh failed.');
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Models</p>
        <span className="helper-text">
          {inventory.totalModelCount} models · {inventory.nodeCount} nodes
        </span>
      </header>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Refresh Inventory</p>
          <p className="subcopy">Rescan local models and persist the shared registry snapshot.</p>
        </div>
        <button type="button" onClick={refreshInventory} disabled={pending}>
          Refresh models
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {inventory.models.map((model) => (
          <li key={`${model.nodeId}:${model.modelId}`} className="insight-item">
            <strong>{model.displayName}</strong>
            <span>{model.nodeId} · {model.backend} · {model.reasoningDepth}/{model.speedTier}{model.contextLength ? ` · ${model.contextLength} ctx` : ''}</span>
          </li>
        ))}
        {inventory.models.length === 0 ? (
          <li className="insight-empty">No models registered yet.</li>
        ) : null}
      </ul>
    </article>
  );
}
