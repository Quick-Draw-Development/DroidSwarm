'use client';

import { useState, useTransition } from 'react';

import type { CodeReviewSummary } from '../lib/types';

export function CodeReviewsPanel({ reviews }: { reviews?: CodeReviewSummary }) {
  const [pending, startTransition] = useTransition();
  const [prId, setPrId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!reviews) {
    return null;
  }

  const runReview = async () => {
    startTransition(async () => {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prId: prId.trim() }),
      });
      const payload = await response.json();
      setMessage(response.ok
        ? `Review ${payload.review?.reviewId ?? ''} completed for ${payload.review?.prId ?? prId.trim()}.`
        : (payload.error as string | undefined) ?? 'Review failed.');
      if (response.ok) {
        setPrId('');
      }
    });
  };

  return (
    <article className="insight-card">
      <header>
        <p className="section-title">Code Reviews</p>
        <span className="helper-text">
          {reviews.completedReviewCount} completed · {reviews.clarificationCount} need clarification
        </span>
      </header>
      <div className="composer-panel" style={{ marginTop: '1rem' }}>
        <div>
          <p className="section-title">Run Review</p>
          <p className="subcopy">Run the code-review-agent against a branch, ref, or PR identifier.</p>
        </div>
        <input value={prId} onChange={(event) => setPrId(event.target.value)} placeholder="pr id or branch" />
        <button type="button" onClick={runReview} disabled={pending || !prId.trim()}>
          Run review
        </button>
        {message ? <p className="helper-text">{message}</p> : null}
      </div>
      <ul className="insight-list">
        {reviews.reviews.map((review) => (
          <li key={review.reviewId} className="insight-item">
            <strong>{review.title}</strong>
            <span>{review.status} · {review.summary}</span>
          </li>
        ))}
        {reviews.reviews.length === 0 ? (
          <li className="insight-empty">No code reviews recorded yet.</li>
        ) : null}
      </ul>
    </article>
  );
}
