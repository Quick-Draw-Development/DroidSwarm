import { AddTaskForm } from './AddTaskForm';
import { BoardClient } from './BoardClient';
import { LiveConnectionStatus } from './LiveConnectionStatus';
import { ProvideInstructionsModal } from './ProvideInstructionsModal';
import type { MessageRecord, TaskRecord } from '../lib/types';

export function BoardShell({
  username,
  tasks,
  projectName,
  operatorMessages,
}: {
  username: string;
  tasks: TaskRecord[];
  projectName: string;
  operatorMessages: MessageRecord[];
}) {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Project Command</p>
          <h1>{projectName}</h1>
          <p className="subcopy">One swarm, one project, durable task memory.</p>
        </div>
        <div className="header-pills">
          <ProvideInstructionsModal username={username} initialMessages={operatorMessages} />
          <span className="identity-pill">@{username}</span>
          <LiveConnectionStatus />
        </div>
      </header>

      <section className="composer-panel">
        <div>
          <p className="section-title">Add Task</p>
          <p className="subcopy">Persist first, then publish to the operator room.</p>
        </div>
        <AddTaskForm username={username} />
      </section>
      <BoardClient username={username} tasks={tasks} />
    </main>
  );
}
