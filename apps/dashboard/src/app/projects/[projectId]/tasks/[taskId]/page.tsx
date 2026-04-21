import { listRoutingDecisionsForTask, listTaskChatMessages, listWorkerHeartbeatsForTask } from '../../../../../lib/db';
import { BranchPolicyCard } from '../../../../../components/branch-policy-card';
import { RoutingDecisionCard } from '../../../../../components/routing-decision-card';
import { SkillPackList } from '../../../../../components/skill-pack-list';
import { TaskChatPanel } from '../../../../../components/task-chat-panel';
import { WorkerHeartbeatPanel } from '../../../../../components/worker-heartbeat-panel';

export const dynamic = 'force-dynamic';

export default async function ProjectTaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { taskId } = await params;
  const messages = listTaskChatMessages(taskId);
  const heartbeats = listWorkerHeartbeatsForTask(taskId);
  const routing = listRoutingDecisionsForTask(taskId);

  return (
    <main>
      <h1>Task {taskId}</h1>
      <TaskChatPanel messages={messages} />
      <WorkerHeartbeatPanel heartbeats={heartbeats} />
      <RoutingDecisionCard decisions={routing} />
      <BranchPolicyCard />
      <SkillPackList skills={['orchestrator', 'planner', 'reviewer']} />
    </main>
  );
}
