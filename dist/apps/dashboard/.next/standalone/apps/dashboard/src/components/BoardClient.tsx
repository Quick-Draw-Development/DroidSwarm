'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { BOARD_STATUSES, type BoardStatus, type TaskRecord } from '../lib/types';
import { TaskCard } from './TaskCard';

const STATUS_LABELS: Record<BoardStatus, string> = {
  todo: 'To Do',
  planning: 'Planning',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export function BoardClient({
  username,
  tasks,
}: {
  username: string;
  tasks: TaskRecord[];
}) {
  const router = useRouter();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const moveTask = (taskId: string, status: BoardStatus): void => {
    startTransition(async () => {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, username }),
      });
      router.refresh();
    });
  };

  return (
    <section className="board-columns">
      {BOARD_STATUSES.map((status) => {
        const tasksForColumn = tasks.filter((task) => task.status === status);
        return (
          <section
            className={`board-column ${draggedTaskId ? 'board-column-droppable' : ''}`}
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('text/task-id') || draggedTaskId;
              if (taskId) {
                moveTask(taskId, status);
              }
              setDraggedTaskId(null);
            }}
          >
            <header>
              <h2>{STATUS_LABELS[status]}</h2>
              <span>{tasksForColumn.length}</span>
            </header>
            <div className="column-list">
              {tasksForColumn.length > 0 ? (
                tasksForColumn.map((task) => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    username={username}
                    draggable={!isPending}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/task-id', task.taskId);
                      setDraggedTaskId(task.taskId);
                    }}
                    onDragEnd={() => setDraggedTaskId(null)}
                  />
                ))
              ) : (
                <p className="empty-copy">No tasks in this lane.</p>
              )}
            </div>
          </section>
        );
      })}
    </section>
  );
}
