'use client';

import { useState, useTransition } from 'react';

import type { GovernanceSummary } from '../lib/types';

export function GovernancePanel({ governance }: { governance?: GovernanceSummary }) {
  const [pending, startTransition] = useTransition();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!governance) {
    return null;
  }

  const submit = async (action: 'approve' | 'reject', proposalId: string) => {
    startTransition(async () => {
      const response = await fetch('/api/governance/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, proposalId }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Proposal ${proposalId} ${action}d.`
        : (payload.error as string | undefined) ?? 'Governance action failed.');
    });
  };

  const propose = async () => {
    startTransition(async () => {
      const response = await fetch('/api/governance/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'propose',
          title: draftTitle.trim(),
          description: draftBody.trim(),
          rationale: draftBody.trim(),
        }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Created proposal ${payload.debate?.proposal?.proposalId ?? ''}.`
        : (payload.error as string | undefined) ?? 'Proposal failed.');
      if (response.ok) {
        setDraftTitle('');
        setDraftBody('');
      }
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Governance</p>
        <span className="helper-text">{governance.pendingProposalCount} pending proposals</span>
      </header>
      <p className="helper-text">
        {governance.activeLawCount} active laws · hash <code>{governance.lawHash.slice(0, 12)}</code>
      </p>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Propose Law</p>
          <p className="subcopy">All proposals trigger debate and stay pending until human approval.</p>
        </div>
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="LAW title" />
        <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Description and rationale" rows={4} />
        <button type="button" onClick={propose} disabled={pending || !draftTitle.trim() || !draftBody.trim()}>
          Submit proposal
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {governance.proposals.map((proposal) => (
          <li key={proposal.proposalId} className="insight-item">
            <strong>{proposal.title}</strong>
            <span>{proposal.lawId} · {proposal.status} · {proposal.proposedBy}</span>
            {proposal.status === 'pending' ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => submit('approve', proposal.proposalId)} disabled={pending}>Approve</button>
                <button type="button" onClick={() => submit('reject', proposal.proposalId)} disabled={pending}>Reject</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
