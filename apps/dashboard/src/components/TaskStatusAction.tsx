'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { BoardStatus } from '../lib/types';

export function TaskStatusAction({
  taskId,
  username,
  nextStatus,
  label,
}: {
  taskId: string;
  username: string;
  nextStatus: BoardStatus;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="secondary-button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await fetch(`/api/tasks/${taskId}/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: nextStatus, username }),
          });
          router.refresh();
        });
      }}
      type="button"
    >
      {isPending ? 'Updating...' : label}
    </button>
  );
}
