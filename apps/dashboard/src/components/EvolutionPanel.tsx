'use client';

import { useState, useTransition } from 'react';

import type { SkillEvolutionSummary } from '../lib/types';

export function EvolutionPanel({ evolution }: { evolution?: SkillEvolutionSummary }) {
  const [pending, startTransition] = useTransition();
  const [targetSkill, setTargetSkill] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!evolution) {
    return null;
  }

  const submit = async (body: Record<string, unknown>) => {
    startTransition(async () => {
      const response = await fetch('/api/skills/evolution', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      setMessage(response.ok ? 'Evolution registry updated.' : (payload.error as string | undefined) ?? 'Evolution action failed.');
      if (response.ok && body.action === 'propose') {
        setTargetSkill('');
      }
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Evolution Proposals</p>
        <span className="helper-text">{evolution.pendingCount} pending human approval</span>
      </header>
      <p className="helper-text">
        approved {evolution.approvedCount} · proposals {evolution.proposals.length}
      </p>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Propose Evolution</p>
          <p className="subcopy">Reflection stays advisory until a human approves the generated skill proposal.</p>
        </div>
        <input value={targetSkill} onChange={(event) => setTargetSkill(event.target.value)} placeholder="optional target skill" />
        <button type="button" onClick={() => submit({ action: 'propose', targetSkill: targetSkill.trim() || undefined })} disabled={pending}>
          Generate proposal
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {evolution.proposals.map((proposal) => (
          <li key={proposal.proposalId} className="insight-item">
            <strong>{proposal.title}</strong>
            <span>{proposal.status} · {proposal.manifestName ?? proposal.targetSkill ?? proposal.proposalType}</span>
            <span>{proposal.description}</span>
            {proposal.status === 'pending-human-approval' ? (
              <button type="button" onClick={() => submit({ action: 'approve', proposalId: proposal.proposalId })} disabled={pending}>Approve</button>
            ) : null}
          </li>
        ))}
        {evolution.proposals.length === 0 ? (
          <li className="insight-empty">No governed evolution proposals recorded yet.</li>
        ) : null}
      </ul>
    </article>
  );
}
