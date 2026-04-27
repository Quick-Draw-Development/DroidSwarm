import { cookies } from 'next/headers';
import { listActiveLaws, listLawProposals, validateCompliance } from '@shared-governance';
import { listRegisteredSkillManifests, listSpecializedAgents } from '@shared-skills';

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
    governance: (() => {
      const laws = listActiveLaws();
      const proposals = listLawProposals();
      const status = validateCompliance({
        eventType: 'dashboard.read',
        actorRole: 'dashboard',
        swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
        projectId: selectedProjectId,
        auditLoggingEnabled: true,
        dashboardEnabled: true,
      });
      return {
        lawHash: status.lawHash,
        activeLawCount: laws.length,
        pendingProposalCount: proposals.filter((entry) => entry.status === 'pending').length,
        approvedProposalCount: proposals.filter((entry) => entry.status === 'approved').length,
        latestDebateAt: proposals[0]?.updatedAt,
        laws: laws.map((law) => ({
          id: law.id,
          title: law.title,
          description: law.description,
          version: law.version,
        })),
        proposals: proposals.slice(0, 8).map((proposal) => ({
          proposalId: proposal.proposalId,
          lawId: proposal.lawId,
          title: proposal.title,
          status: proposal.status,
          proposedBy: proposal.proposedBy,
          updatedAt: proposal.updatedAt,
        })),
      };
    })(),
    skillsRegistry: (() => {
      const skills = listRegisteredSkillManifests();
      const agents = listSpecializedAgents();
      return {
        activeSkillCount: skills.filter((entry) => entry.status === 'active').length,
        pendingSkillCount: skills.filter((entry) => entry.status === 'pending-approval').length,
        activeAgentCount: agents.filter((entry) => entry.status === 'active').length,
        pendingAgentCount: agents.filter((entry) => entry.status === 'pending-approval').length,
        skills: skills.slice(0, 8).map((entry) => ({
          name: entry.name,
          version: entry.version,
          status: entry.status,
          capabilities: entry.capabilities,
        })),
        agents: agents.slice(0, 8).map((entry) => ({
          name: entry.name,
          version: entry.version,
          status: entry.status,
          skills: entry.skills,
          priority: entry.priority,
        })),
      };
    })(),
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
