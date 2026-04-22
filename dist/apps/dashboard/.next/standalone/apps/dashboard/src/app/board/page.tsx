import { cookies } from 'next/headers';

import { BoardShell } from '../../components/BoardShell';
import { UsernameGate } from '../../components/UsernameGate';
import { USERNAME_COOKIE } from '../../lib/identity';
import { getAppVersion } from '../../lib/version';
import {
  getProjectIdentity,
  getPreferredBoardRunId,
  getRunAllocatorPolicy,
  getRunServiceUsage,
  listAgentAssignmentsForRun,
  listArtifactsForRun,
  listBudgetEventsForRun,
  listCheckpointsForRun,
  getRunTopology,
  getRunRoutingTelemetry,
  listOperatorMessages,
  listRuns,
  listTaskDependenciesForRun,
  listTaskNodesForRun,
  listBoardTasksForRun,
  listVerificationOutcomesForRun,
  listRunTimelineEvents,
} from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const cookieStore = await cookies();
  const username = cookieStore.get(USERNAME_COOKIE)?.value;

  if (!username) {
    return <UsernameGate />;
  }

  const project = getProjectIdentity();
  const runs = listRuns();
  const latestRunId = getPreferredBoardRunId();
  const tasks = listBoardTasksForRun(latestRunId);
  const insights = {
    runs,
    tasks: listTaskNodesForRun(latestRunId),
    artifacts: listArtifactsForRun(latestRunId),
    checkpoints: listCheckpointsForRun(latestRunId),
    budgets: listBudgetEventsForRun(latestRunId),
    assignments: listAgentAssignmentsForRun(latestRunId),
    dependencies: listTaskDependenciesForRun(latestRunId),
    verifications: listVerificationOutcomesForRun(latestRunId),
    timeline: listRunTimelineEvents(latestRunId),
    routingTelemetry: getRunRoutingTelemetry(latestRunId),
    allocatorPolicy: getRunAllocatorPolicy(latestRunId),
    topology: getRunTopology(latestRunId),
    serviceUsage: getRunServiceUsage(latestRunId),
  };
  const operatorMessages = listOperatorMessages();
  const appVersion = getAppVersion();

  return (
    <BoardShell
      username={username}
      tasks={tasks}
      insights={insights}
      projectName={project.projectName}
      operatorMessages={operatorMessages}
      appVersion={appVersion}
    />
  );
}
