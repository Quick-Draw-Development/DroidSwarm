import { getTaskDetails, listRoutingDecisionsForTask, listTaskChatMessages, listWorkerHeartbeatsForTask } from '../../../../../lib/db';
import { BranchPolicyCard } from '../../../../../components/branch-policy-card';
import { RoutingDecisionCard } from '../../../../../components/routing-decision-card';
import { SkillPackList } from '../../../../../components/skill-pack-list';
import { TaskChatPanel } from '../../../../../components/task-chat-panel';
import { WorkerHeartbeatPanel } from '../../../../../components/worker-heartbeat-panel';
import { translateDroidspeakV2 } from '../../../../../lib/droidspeak';

export const dynamic = 'force-dynamic';

export default async function ProjectTaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { taskId } = await params;
  const messages = listTaskChatMessages(taskId);
  const heartbeats = listWorkerHeartbeatsForTask(taskId);
  const routing = listRoutingDecisionsForTask(taskId);
  const details = getTaskDetails(taskId);
  const latestDigestDroidspeak = details?.latestDigest?.droidspeak ? translateDroidspeakV2(details.latestDigest.droidspeak) : undefined;
  const latestHandoffDroidspeak = details?.latestHandoff?.droidspeak ? translateDroidspeakV2(details.latestHandoff.droidspeak) : undefined;

  return (
    <main>
      <h1>Task {taskId}</h1>
      {details?.latestDigest ? (
        <section>
          <h2>Latest Digest</h2>
          <p>{details.latestDigest.objective}</p>
          <p>Plan: {details.latestDigest.currentPlan.join(' | ') || 'none'}</p>
          <p>Blockers: {details.latestDigest.activeRisks.join(' | ') || 'none'}</p>
          <p>Open questions: {details.latestDigest.openQuestions.join(' | ') || 'none'}</p>
          <p>Verification: {details.latestDigest.verificationState}</p>
          <p>Updated by: {details.latestDigest.lastUpdatedBy}</p>
          <p>Artifacts: {details.latestDigest.artifactIndex.map((artifact) => artifact.summary).join(' | ') || 'none'}</p>
          {latestDigestDroidspeak?.badgeLabel ? (
            <p>
              <span className="droidspeak-chip">{latestDigestDroidspeak.badgeLabel}</span>
              {' '}
              <code className="droidspeak-compact">{latestDigestDroidspeak.compact}</code>
              {' '}
              {latestDigestDroidspeak.translation}
            </p>
          ) : null}
        </section>
      ) : null}
      {details?.bestCurrentUnderstanding ? (
        <section>
          <h2>Best Current Understanding</h2>
          <p>Objective: {details.bestCurrentUnderstanding.objective}</p>
          <p>Plan: {details.bestCurrentUnderstanding.plan.join(' | ') || 'none'}</p>
          <p>Current blockers: {details.bestCurrentUnderstanding.blockers.join(' | ') || 'none'}</p>
          <p>Key findings: {details.bestCurrentUnderstanding.keyFindings.join(' | ') || 'none'}</p>
          <p>Current artifacts: {details.bestCurrentUnderstanding.artifacts.map((artifact) => artifact.reasonRelevant ?? artifact.summary).join(' | ') || 'none'}</p>
          <p>Verification status: {details.bestCurrentUnderstanding.verificationStatus}</p>
          <p>Latest handoff summary: {details.bestCurrentUnderstanding.latestHandoffSummary ?? 'none'}</p>
        </section>
      ) : null}
      {details?.latestHandoff ? (
        <section>
          <h2>Latest Handoff</h2>
          <p>{details.latestHandoff.summary}</p>
          <p>To role: {details.latestHandoff.toRole}</p>
          <p>Required reads: {details.latestHandoff.requiredReads.join(', ') || 'none'}</p>
          {latestHandoffDroidspeak?.badgeLabel ? (
            <p>
              <span className="droidspeak-chip">{latestHandoffDroidspeak.badgeLabel}</span>
              {' '}
              <code className="droidspeak-compact">{latestHandoffDroidspeak.compact}</code>
              {' '}
              {latestHandoffDroidspeak.translation}
            </p>
          ) : null}
        </section>
      ) : null}
      {details?.latestRoutingTelemetry ? (
        <section>
          <h2>Routing Telemetry</h2>
          <p>Model tier: {details.latestRoutingTelemetry.modelTier ?? 'unassigned'}</p>
          <p>Queue depth: {details.latestRoutingTelemetry.queueDepth ?? 0}</p>
          <p>Fallback count: {details.latestRoutingTelemetry.fallbackCount ?? 0}</p>
        </section>
      ) : null}
      <TaskChatPanel messages={messages} />
      <WorkerHeartbeatPanel heartbeats={heartbeats} />
      <RoutingDecisionCard decisions={routing} />
      <BranchPolicyCard />
      <SkillPackList skills={['orchestrator', 'planner', 'reviewer']} />
    </main>
  );
}
