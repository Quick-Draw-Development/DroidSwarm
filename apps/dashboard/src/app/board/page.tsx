import { cookies } from 'next/headers';
import {
  computeSystemStateHash,
  listActiveLaws,
  listConsensusRounds,
  listDriftSnapshots,
  listGovernanceRoles,
  listLawProposals,
  validateCompliance,
} from '@shared-governance';
import { getModelLifecycleStatus, listDiscoveredModels, listRegisteredModels } from '@shared-models';
import { listRegisteredSkillManifests, listSpecializedAgents } from '@shared-skills';
import { listCodeReviewRuns } from '@shared-projects';

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
        systemStateHash: computeSystemStateHash(),
        activeLawCount: laws.length,
        pendingProposalCount: proposals.filter((entry) => entry.status === 'pending').length,
        approvedProposalCount: proposals.filter((entry) => entry.status === 'approved').length,
        latestDebateAt: proposals[0]?.updatedAt,
        roles: listGovernanceRoles(),
        consensus: listConsensusRounds().slice(0, 8).map((round) => ({
          consensusId: round.consensusId,
          proposalId: round.proposalId,
          proposalType: round.proposalType,
          approved: round.approved,
          guardianVeto: round.guardianVeto,
          updatedAt: round.updatedAt,
        })),
        drift: listDriftSnapshots().slice(0, 8).map((snapshot) => ({
          nodeId: snapshot.nodeId,
          localHash: snapshot.localHash,
          remoteHash: snapshot.remoteHash,
          matches: snapshot.matches,
          source: snapshot.source,
          createdAt: snapshot.createdAt,
        })),
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
    codeReviews: (() => {
      const reviews = listCodeReviewRuns({ projectId: selectedProjectId }).slice(0, 8);
      return {
        activeReviewCount: reviews.filter((entry) => entry.status === 'pending').length,
        clarificationCount: reviews.filter((entry) => entry.status === 'clarification-needed').length,
        completedReviewCount: reviews.filter((entry) => entry.status === 'completed').length,
        reviews: reviews.map((entry) => ({
          reviewId: entry.reviewId,
          prId: entry.prId,
          title: entry.title,
          status: entry.status,
          summary: entry.summary,
          findingsMarkdown: entry.findingsMarkdown,
          updatedAt: entry.updatedAt,
        })),
      };
    })(),
    modelInventory: (() => {
      const models = listRegisteredModels().slice(0, 12);
      const discovered = listDiscoveredModels({ newOnly: false }).slice(0, 8);
      const backendCounts = new Map<string, number>();
      const nodes = new Set<string>();
      for (const model of models) {
        backendCounts.set(model.backend, (backendCounts.get(model.backend) ?? 0) + 1);
        nodes.add(model.nodeId);
      }
      return {
        totalModelCount: models.length,
        nodeCount: nodes.size,
        discoveredModelCount: discovered.length,
        backends: [...backendCounts.entries()].map(([backend, count]) => ({ backend, count })),
        models: models.map((model) => ({
          nodeId: model.nodeId,
          modelId: model.modelId,
          displayName: model.displayName,
          backend: model.backend,
          reasoningDepth: model.reasoningDepth,
          speedTier: model.speedTier,
          contextLength: model.contextLength,
          updatedAt: model.updatedAt,
        })),
        discovered: discovered.map((model) => ({
          nodeId: model.nodeId,
          modelId: model.modelId,
          displayName: model.displayName,
          author: typeof model.metadata.author === 'string' ? model.metadata.author : undefined,
          quantization: model.quantization,
          lifecycleStatus: getModelLifecycleStatus(model),
          updatedAt: model.updatedAt,
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
