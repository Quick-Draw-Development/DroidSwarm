import { cookies } from 'next/headers';

import { BoardShell } from '../../components/BoardShell';
import { ProjectSwitcher } from '../../components/project-switcher';
import { UsernameGate } from '../../components/UsernameGate';
import { USERNAME_COOKIE } from '../../lib/identity';
import { getAppVersion } from '../../lib/version';
import {
  getProjectIdentity,
  getPreferredBoardRunId,
  getAuditTrail,
  getFederationStatus,
  getRunAllocatorPolicy,
  getRunServiceUsage,
  listAgentAssignmentsForRun,
  listArtifactsForRun,
  listBudgetEventsForRun,
  listCheckpointsForRun,
  getRunTopology,
  getRunRoutingTelemetry,
  listOperatorMessages,
  listProjects,
  listRuns,
  listTaskDependenciesForRun,
  listTaskNodesForRun,
  listBoardTasksForRun,
  listVerificationOutcomesForRun,
  listRunTimelineEvents,
} from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  searchParams,
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const cookieStore = await cookies();
  const username = cookieStore.get(USERNAME_COOKIE)?.value;
  const requestedProjectId = (await searchParams)?.projectId;

  if (!username) {
    return <UsernameGate />;
  }

  const projects = listProjects();
  const selectedProjectId = requestedProjectId
    ?? projects[0]?.projectId
    ?? getProjectIdentity().projectId;
  const project = getProjectIdentity(selectedProjectId);
  const runs = listRuns(selectedProjectId);
  const latestRunId = getPreferredBoardRunId(selectedProjectId);
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
    federation: getFederationStatus(),
    auditTrail: getAuditTrail(latestRunId),
  };
  const operatorMessages = listOperatorMessages();
  const appVersion = getAppVersion();

  return (
    <>
      <ProjectSwitcher projects={projects} selectedProjectId={selectedProjectId} />
      <BoardShell
        username={username}
        tasks={tasks}
        insights={insights}
        projectName={project.projectName}
        operatorMessages={operatorMessages}
        appVersion={appVersion}
      />
    </>
  );
}
