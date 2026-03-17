import Link from 'next/link';

import type { TaskRecord } from '../lib/types';

export function TaskCard({
  task,
  username,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRecord;
  username: string;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
}) {
  const mentionTargeted = task.needsClarification && task.createdByUserId === username;

  return (
    <article
      className="task-card"
      draggable={draggable}
      onDragStart={(event) => onDragStart?.(event)}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className="task-card-head">
        <span className={`type-pill type-${task.taskType}`}>{task.taskType}</span>
        <span className={`priority-pill priority-${task.priority}`}>{task.priority}</span>
      </div>
      <h3>{task.title}</h3>
      <p>{task.description}</p>
      <dl className="task-meta">
        <div>
          <dt>Agents</dt>
          <dd>{task.agentCount}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{new Date(task.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <div className="task-flags">
        {mentionTargeted ? <span className="flag flag-mention">Needs your reply</span> : null}
        {task.blockedReason ? <span className="flag flag-blocked">Blocked</span> : null}
        {task.stage ? <span className="stage-pill">{task.stage}</span> : null}
      </div>
      <Link className="task-link" href={`/channels/${task.taskId}`}>
        View Channel
      </Link>
    </article>
  );
}
