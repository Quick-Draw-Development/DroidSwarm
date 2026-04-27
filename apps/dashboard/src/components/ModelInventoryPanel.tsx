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

  const discoverRemoteModels = async () => {
    startTransition(async () => {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'discover' }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Discovery found ${payload.discovery?.discovered?.length ?? 0} new models.`
        : (payload.error as string | undefined) ?? 'Model discovery failed.');
    });
  };

  const downloadModel = async (modelId: string) => {
    startTransition(async () => {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'download', modelId }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Downloaded ${payload.model?.displayName ?? modelId}.`
        : (payload.error as string | undefined) ?? 'Model download failed.');
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Models</p>
        <span className="helper-text">
          {inventory.totalModelCount} models · {inventory.nodeCount} nodes · {inventory.discoveredModelCount} discovered
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
        <button type="button" onClick={discoverRemoteModels} disabled={pending}>
          Discover remote models
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      {inventory.discovered.length > 0 ? (
        <div className="composer-panel" style={{ marginTop: '1rem' }}>
          <div>
            <p className="section-title">Recently Discovered</p>
            <p className="subcopy">Remote GGUF candidates waiting for download or review.</p>
          </div>
          <ul className="insight-list">
            {inventory.discovered.map((model) => (
              <li key={`${model.nodeId}:${model.modelId}`} className="insight-item">
                <strong>{model.displayName}</strong>
                <span>{model.author ?? 'unknown author'} · {model.quantization ?? 'unknown quant'} · {model.lifecycleStatus}</span>
                <button type="button" onClick={() => downloadModel(model.modelId)} disabled={pending}>
                  Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
