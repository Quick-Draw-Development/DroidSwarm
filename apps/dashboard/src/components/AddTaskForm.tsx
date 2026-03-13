'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function AddTaskForm({ username }: { username: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<'feature' | 'bug' | 'task'>('feature');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          taskType,
          priority,
          username,
        }),
      });

      if (!response.ok) {
        setError('Unable to create task.');
        return;
      }

      setTitle('');
      setDescription('');
      router.refresh();
    });
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="task-form-grid">
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          <span>Type</span>
          <select value={taskType} onChange={(event) => setTaskType(event.target.value as 'feature' | 'bug' | 'task')}>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="task">Task</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as 'low' | 'medium' | 'high' | 'urgent')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>
      <label>
        <span>Description</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} required />
      </label>
      <div className="task-form-actions">
        <button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create Task'}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </form>
  );
}
