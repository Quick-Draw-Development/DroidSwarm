'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { isValidUsername } from '../lib/identity';

export function UsernameGate() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (!isValidUsername(username)) {
      setError('Use lowercase letters, numbers, and underscores only.');
      return;
    }

    startTransition(async () => {
      const response = await fetch('/api/identity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        setError('Unable to save username.');
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="gate-shell">
      <div className="gate-card">
        <p className="eyebrow">DroidSwarm Identity</p>
        <h1>Choose your operator name</h1>
        <p className="gate-copy">This stays local in a cookie and is used for task creation, mentions, and clarification replies.</p>
        <form className="gate-form" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="alice_dev"
            autoComplete="off"
          />
          <button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Enter DroidSwarm'}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : <p className="helper-text">Allowed: `a-z`, `0-9`, `_`</p>}
      </div>
    </div>
  );
}
