import { AddTaskForm } from './AddTaskForm';
import { BoardClient } from './BoardClient';
import { GovernancePanel } from './GovernancePanel';
import { LiveConnectionStatus } from './LiveConnectionStatus';
import { ProvideInstructionsModal } from './ProvideInstructionsModal';
import { OrchestrationInsights } from './OrchestrationInsights';
import type { MessageRecord, TaskRecord, OrchestrationInsightsData } from '../lib/types';

export function BoardShell({
  username,
  tasks,
  projectName,
  operatorMessages,
  appVersion,
  insights,
}: {
  username: string;
  tasks: TaskRecord[];
  projectName: string;
  operatorMessages: MessageRecord[];
  appVersion?: string;
  insights: OrchestrationInsightsData;
}) {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Project Command</p>
          <h1>{projectName}</h1>
          <p className="subcopy">One swarm, one project, durable task memory.</p>
          {appVersion && <p className="version-pill">Version {appVersion}</p>}
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
      <GovernancePanel governance={insights.governance} />
      <OrchestrationInsights data={insights} />
    </main>
  );
}
