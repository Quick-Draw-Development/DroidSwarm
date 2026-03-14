import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';

import { ChannelRoom } from '../../../components/ChannelRoom';
import { LiveConnectionStatus } from '../../../components/LiveConnectionStatus';
import { TaskStatusAction } from '../../../components/TaskStatusAction';
import { USERNAME_COOKIE } from '../../../lib/identity';
import { getTaskDetails } from '../../../lib/db';

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const details = getTaskDetails(taskId);
  const cookieStore = await cookies();
  const username = cookieStore.get(USERNAME_COOKIE)?.value;

  if (!details) {
    notFound();
  }

  return (
    <main className="channel-shell">
      <header className="channel-header">
        <div>
          <Link className="back-link" href="/board">
            ← Back to board
          </Link>
          <h1>{details.task.title}</h1>
          <p>{details.task.description}</p>
          {username ? (
            <div className="channel-actions">
              {details.task.status !== 'cancelled' ? (
                <TaskStatusAction
                  taskId={details.task.taskId}
                  username={username}
                  nextStatus="cancelled"
                  label="Move to Cancelled"
                />
              ) : (
                <TaskStatusAction
                  taskId={details.task.taskId}
                  username={username}
                  nextStatus="todo"
                  label="Restore to To Do"
                />
              )}
            </div>
          ) : null}
        </div>
        <LiveConnectionStatus />
      </header>

      <section className="channel-grid">
        <aside className="channel-sidebar">
          <div className="sidebar-card">
            <p className="section-title">Active Agents</p>
            <ul>
              {details.activeAgents.map((agent) => (
                <li key={agent.name}>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="sidebar-card">
            <p className="section-title">Workflow</p>
            <ul>
              {details.guardrails.map((guardrail) => <li key={guardrail}>{guardrail}</li>)}
            </ul>
          </div>
          <div className="sidebar-card">
            <p className="section-title">Limits</p>
            <ul>
              {details.limits.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          </div>
        </aside>

        <section className="channel-main">
          <ChannelRoom
            taskId={details.task.taskId}
            initialMessages={details.messages}
            username={username ?? undefined}
          />
        </section>
      </section>
    </main>
  );
}
