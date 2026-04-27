import type {
  AgentAssignmentSummary,
  ArtifactSummary,
  AuditTrailSummary,
  BudgetEventSummary,
  CheckpointSummary,
  DependencySummary,
  FederationStatusSummary,
  OrchestrationInsightsData,
  RunSummary,
  RunTimelineEntry,
  SkillsRegistrySummary,
  TaskNode,
  VerificationTaskSummary,
} from '../lib/types';

const displayDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const runLabel = (run: RunSummary): string => {
  const idShort = run.runId.slice(-6);
  return `Run ${idShort}`;
};

type TaskGraphEntry = TaskNode & { depth: number };

const sortByUpdatedAt = (a: { updatedAt: string }, b: { updatedAt: string }): number =>
  b.updatedAt.localeCompare(a.updatedAt);

const buildTaskGraphEntries = (nodes: TaskNode[]): TaskGraphEntry[] => {
  if (nodes.length === 0) {
    return [];
  }

  const nodeIds = new Set(nodes.map((node) => node.taskId));
  const children = new Map<string, TaskNode[]>();
  for (const node of nodes) {
    if (node.parentTaskId) {
      const bucket = children.get(node.parentTaskId) ?? [];
      bucket.push(node);
      children.set(node.parentTaskId, bucket);
    }
  }

  const roots = nodes.filter((node) => !node.parentTaskId || !nodeIds.has(node.parentTaskId));
  const entries: TaskGraphEntry[] = [];

  const addNode = (node: TaskNode, depth: number) => {
    entries.push({ ...node, depth });
    const directChildren = children.get(node.taskId) ?? [];
    directChildren.sort(sortByUpdatedAt);
    for (const child of directChildren) {
      addNode(child, depth + 1);
    }
  };

  roots.sort(sortByUpdatedAt);
  for (const root of roots) {
    addNode(root, 0);
  }

  return entries;
};

const renderTaskGraphEntry = (entry: TaskGraphEntry, index: number) => (
  <li
    key={`${entry.taskId}-${index}`}
    className="insight-item task-graph-item"
    style={{ paddingLeft: `${14 + entry.depth * 14}px` }}
  >
    <div>
      <strong>{entry.name}</strong>
      <span className="stage-pill">{entry.stage ?? entry.status}</span>
    </div>
    <span className="task-graph-meta">
      {entry.priority} · {displayDate(entry.updatedAt)}
    </span>
  </li>
);

const renderTimelineEntry = (entry: RunTimelineEntry, index: number) => {
  const subject = entry.taskName ?? entry.taskId ?? entry.eventType;
  return (
    <li key={`${entry.eventId}-${index}`} className="timeline-entry">
      <div className="timeline-row">
        <strong>{subject}</strong>
        <span className="timeline-meta">{displayDate(entry.createdAt)}</span>
      </div>
      <p className="timeline-detail">{entry.detail}</p>
      <span className="timeline-tag">{entry.eventType}</span>
    </li>
  );
};

const renderArtifactEntry = (artifact: ArtifactSummary, index: number) => (
  <li key={`${artifact.artifactId}-${index}`} className="insight-item">
    <strong>{artifact.kind}</strong>
    <span>{artifact.summary}</span>
  </li>
);

const renderCheckpointEntry = (checkpoint: CheckpointSummary, index: number) => (
  <li key={`${checkpoint.checkpointId}-${index}`} className="insight-item">
    <strong>{checkpoint.summary ?? 'Checkpoint'}</strong>
    <span>{displayDate(checkpoint.createdAt)}</span>
  </li>
);

const renderBudgetEntry = (event: BudgetEventSummary, index: number) => (
  <li key={`${event.eventId}-${index}`} className="insight-item">
    <strong>{event.detail}</strong>
    <span>{`Consumed ${event.consumed}`}</span>
  </li>
);

const renderAssignmentEntry = (assignment: AgentAssignmentSummary, index: number) => (
  <li key={`${assignment.agentName}-${index}`} className="insight-item">
    <strong>{assignment.agentName}</strong>
    <span>{assignment.role ?? 'agent'} · {assignment.taskName ?? assignment.taskId}</span>
  </li>
);

const renderVerificationEntry = (entry: VerificationTaskSummary, index: number) => (
  <li key={`${entry.taskId}-${index}`} className="insight-item">
    <strong>{entry.name}</strong>
    <span>{entry.stage} · {entry.status}</span>
  </li>
);

const renderDependencyEntry = (entry: DependencySummary, index: number) => (
  <li key={`${entry.dependencyId}-${index}`} className="insight-item">
    <strong>{entry.taskId}</strong>
    <span>{`depends on ${entry.dependsOnTaskId}`}</span>
  </li>
);

const renderFederationPeerEntry = (peer: FederationStatusSummary['peers'][number], index: number) => (
  <li key={`${peer.peerId}-${index}`} className="insight-item">
    <strong>{peer.peerId}</strong>
    <span>
      {peer.busUrl}
      {peer.adminUrl ? ` · admin ${peer.adminUrl}` : ''}
      {peer.capabilities.length > 0 ? ` · ${peer.capabilities.join(', ')}` : ''}
    </span>
  </li>
);

const renderAuditEntry = (entry: AuditTrailSummary['latestEvents'][number], index: number) => (
  <li key={`${entry.id}-${index}`} className="insight-item">
    <strong>{entry.eventType}</strong>
    <span>
      {entry.detail} · {entry.nodeId} · {displayDate(entry.ts)}
    </span>
  </li>
);

const renderRegisteredSkillEntry = (entry: SkillsRegistrySummary['skills'][number], index: number) => (
  <li key={`${entry.name}-${index}`} className="insight-item">
    <strong>{entry.name}</strong>
    <span>{entry.status} · {entry.capabilities.join(', ') || 'no capabilities declared'}</span>
  </li>
);

const schedulerEventTypes = new Set([
  'run_started',
  'run_recovered',
  'plan_proposed',
  'spawn_requested',
  'task_assigned',
  'checkpoint_created',
  'verification_requested',
  'verification_completed',
  'artifact_created',
  'agent_result',
]);

const renderSchedulerEntry = (entry: RunTimelineEntry, index: number) => (
  <li key={`${entry.eventId}-${index}`} className="insight-item">
    <strong>{entry.eventType}</strong>
    <span>{entry.detail}</span>
  </li>
);

export function OrchestrationInsights({ data }: { data: OrchestrationInsightsData }) {
  const latestRun = data.runs[0];
  const runList = data.runs.slice(0, 4);
  const timeline = data.timeline.slice(0, 6);
  const graphEntries = buildTaskGraphEntries(data.tasks);
  const uniqueAgents = new Set(data.assignments.map((assignment) => assignment.agentName));
  const schedulerEvents = data.timeline.filter((entry) => schedulerEventTypes.has(entry.eventType));
  const routingTelemetry = data.routingTelemetry;
  const allocatorPolicy = data.allocatorPolicy;
  const topology = data.topology;
  const serviceUsage = data.serviceUsage;
  const federation = data.federation;
  const auditTrail = data.auditTrail;
  const governance = data.governance;
  const skillsRegistry = data.skillsRegistry;
  const runSummary = (() => {
    if (!latestRun?.metadata) {
      return undefined;
    }

    const metadata = latestRun.metadata;
    if (typeof metadata.summary === 'string') {
      return metadata.summary;
    }

    if (typeof metadata.description === 'string') {
      return metadata.description;
    }

    return undefined;
  })();

  const runStats = latestRun
    ? [
        { label: 'Status', value: latestRun.status },
        { label: 'Tasks', value: `${data.tasks.length}` },
        { label: 'Agents', value: `${uniqueAgents.size}` },
        { label: 'Started', value: displayDate(latestRun.createdAt) },
        { label: 'Updated', value: displayDate(latestRun.updatedAt) },
      ]
    : [];

  return (
    <section className="insights-panel">
      <header className="insights-header">
        <div>
          <p className="section-title">Control plane</p>
          <h2>{latestRun ? `${runLabel(latestRun)} · ${latestRun.status}` : 'Awaiting work'}</h2>
        </div>
        {latestRun ? (
          <span className={`status-pill status-${latestRun.status}`}>{latestRun.status}</span>
        ) : null}
      </header>

      <div className="insights-grid insights-grid--primary">
        <article className="insight-card insight-card--run-detail">
          <p className="section-title">Run detail</p>
          {latestRun ? (
            <>
              <h3>{runLabel(latestRun)}</h3>
              <p className="helper-text">{runSummary ?? 'Planning and scheduling in progress.'}</p>
              <dl className="run-detail-stats">
                {runStats.map((stat) => (
                  <div key={stat.label} className="run-detail-stat">
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="empty-copy">No runs recorded yet.</p>
          )}
        </article>
        <article className="insight-card">
          <header>
            <p className="section-title">Task timeline</p>
            <span className="helper-text">{timeline.length} recent events</span>
          </header>
          {timeline.length > 0 ? (
            <ul className="timeline-list">
              {timeline.map(renderTimelineEntry)}
            </ul>
          ) : (
            <p className="empty-copy">No execution events captured yet.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Scheduler events</p>
          <ul className="insight-list">
            {schedulerEvents.length > 0
              ? schedulerEvents.slice(0, 4).map(renderSchedulerEntry)
              : <li className="insight-empty">No scheduler events captured yet.</li>}
          </ul>
        </article>
        <article className="insight-card">
          <p className="section-title">Allocator policy</p>
          {allocatorPolicy ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Parallel helpers</strong>
                <span>{allocatorPolicy.maxParallelHelpers ?? 'default'} total · {allocatorPolicy.maxSameRoleHelpers ?? 'default'} same-role</span>
              </li>
              <li className="insight-item">
                <strong>Local-first controls</strong>
                <span>queue tolerance {allocatorPolicy.localQueueTolerance ?? 'default'} · cloud {allocatorPolicy.cloudEscalationAllowed ? 'allowed' : 'local-only'}</span>
              </li>
              <li className="insight-item">
                <strong>Priority bias</strong>
                <span>{allocatorPolicy.priorityBias ?? 'balanced'}</span>
              </li>
            </ul>
          ) : (
            <p className="empty-copy">No allocator policy captured yet.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Routing telemetry</p>
          {routingTelemetry ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Model tiers</strong>
                <span>
                  {routingTelemetry.modelTierCounts.map((entry) => `${entry.modelTier} ${entry.count}`).join(' · ') || 'none'}
                </span>
              </li>
              <li className="insight-item">
                <strong>Queue / fallback</strong>
                <span>avg queue {routingTelemetry.averageQueueDepth} · avg fallback {routingTelemetry.averageFallbackCount}</span>
              </li>
              <li className="insight-item">
                <strong>Cloud escalations</strong>
                <span>
                  {routingTelemetry.cloudEscalationCount}
                  {routingTelemetry.escalationReasons.length > 0
                    ? ` · ${routingTelemetry.escalationReasons.map((entry) => `${entry.reason} ${entry.count}`).join(' · ')}`
                    : ''}
                </span>
              </li>
              <li className="insight-item">
                <strong>Latency by role / engine</strong>
                <span>
                  {routingTelemetry.averageLatencyByRoleAndEngine.slice(0, 3).map((entry) => `${entry.role}/${entry.engine} ${entry.averageElapsedMs}ms`).join(' · ') || 'none'}
                </span>
              </li>
            </ul>
          ) : (
            <p className="empty-copy">No routing telemetry captured yet.</p>
          )}
        </article>
      </div>

      <div className="insights-grid insights-grid--secondary">
        <article className="insight-card">
          <p className="section-title">Swarm topology</p>
          {topology && topology.helpers.length > 0 ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Active roles</strong>
                <span>{topology.activeRoles.map((entry) => `${entry.role} ${entry.count}`).join(' · ') || 'none'}</span>
              </li>
              {topology.helpers.slice(0, 5).map((helper) => (
                <li key={helper.attemptId} className="insight-item">
                  <strong>{helper.role}</strong>
                  <span>
                    {helper.taskName} · {helper.status}/{helper.taskStatus}
                    {helper.modelTier ? ` · ${helper.modelTier}` : ''}
                    {helper.routeKind ? ` · ${helper.routeKind}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">No topology snapshot captured yet.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Service usage</p>
          {serviceUsage ? (
            <ul className="insight-list">
              {serviceUsage.health ? (
                <>
                  <li className="insight-item">
                    <strong>Runtime health</strong>
                    <span>
                      overall {serviceUsage.health.allReady ? 'ready' : 'degraded'} · exports {serviceUsage.health.exportsReady ? 'ready' : 'incomplete'}
                      {serviceUsage.health.updatedAt ? ` · updated ${serviceUsage.health.updatedAt}` : ''}
                    </span>
                  </li>
                  <li className="insight-item">
                    <strong>Service reachability</strong>
                    <span>
                      llama {serviceUsage.health.llama.reachable ? 'ok' : 'down'}
                    </span>
                  </li>
                  <li className="insight-item">
                    <strong>llama inventory</strong>
                    <span>
                      model {serviceUsage.health.llama.model ?? 'unset'} · selected {serviceUsage.health.llama.modelPresent ? 'present' : 'missing'} · inventory {serviceUsage.health.llama.inventoryPresent ? serviceUsage.health.llama.inventoryCount : 0} models · selected in inventory {serviceUsage.health.llama.inventoryHasSelected ? 'yes' : 'no'}
                    </span>
                  </li>
                </>
              ) : null}
              <li className="insight-item">
                <strong>llama.cpp</strong>
                <span>
                  requests {serviceUsage.llama.requestCount} · failures {serviceUsage.llama.failureCount} · avg latency {serviceUsage.llama.averageLatencyMs}ms · local coverage {serviceUsage.llama.localCoveragePercent}% · cloud bypass {serviceUsage.llama.cloudBypassRatePercent}%
                </span>
              </li>
              <li className="insight-item">
                <strong>Local role coverage</strong>
                <span>
                  {serviceUsage.llama.localRoleCoverage.map((entry) => `${entry.role} ${entry.count}`).join(' · ') || 'none'}
                </span>
              </li>
              <li className="insight-item">
                <strong>Coverage targets</strong>
                <span>
                  local 80%+ {serviceUsage.llama.meetsLocalCoverageTarget ? 'met' : 'missed'} · cloud &lt;10% {serviceUsage.llama.meetsCloudEscalationTarget ? 'met' : 'missed'}
                  {serviceUsage.llama.bypassReasons.length > 0
                    ? ` · ${serviceUsage.llama.bypassReasons.map((entry) => `${entry.reason} ${entry.count}`).join(' · ')}`
                    : ''}
                </span>
              </li>
              <li className="insight-item">
                <strong>Service policy</strong>
                <span>{serviceUsage.policy.status} · {serviceUsage.policy.summary}</span>
              </li>
              {serviceUsage.policy.actions.length > 0 ? (
                <li className="insight-item">
                  <strong>Operator actions</strong>
                  <span>{serviceUsage.policy.actions.join(' · ')}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="empty-copy">No service usage captured yet.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Federation status</p>
          {federation ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Enabled</strong>
                <span>
                  {federation.enabled ? 'yes' : 'no'} · state {federation.state}
                  {federation.updatedAt ? ` · updated ${displayDate(federation.updatedAt)}` : ''}
                </span>
              </li>
              <li className="insight-item">
                <strong>Bus / admin</strong>
                <span>
                  {federation.busUrl ?? 'bus unset'}
                  {federation.adminUrl ? ` · ${federation.adminUrl}` : ' · admin unset'}
                </span>
              </li>
              <li className="insight-item">
                <strong>Peer count</strong>
                <span>
                  {federation.peerCount ?? federation.peers.length} peers
                  {federation.recentEventCount != null ? ` · ${federation.recentEventCount} recent events` : ''}
                </span>
              </li>
              {federation.nodeId || federation.host || federation.busPort || federation.adminPort ? (
                <li className="insight-item">
                  <strong>Node</strong>
                  <span>
                    {federation.nodeId ?? 'node unset'}
                    {federation.host ? ` · ${federation.host}` : ''}
                    {federation.busPort ? ` · bus ${federation.busPort}` : ''}
                    {federation.adminPort ? ` · admin ${federation.adminPort}` : ''}
                  </span>
                </li>
              ) : null}
              {federation.peers.length > 0 ? federation.peers.slice(0, 5).map(renderFederationPeerEntry) : null}
            </ul>
          ) : (
            <p className="empty-copy">No federation snapshot captured yet.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Audit Trail</p>
          {auditTrail ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Merkle root</strong>
                <span>{auditTrail.merkleRoot}</span>
              </li>
              <li className="insight-item">
                <strong>Chain verification</strong>
                <span>{auditTrail.chainVerified ? 'verified' : 'failed'}</span>
              </li>
              {auditTrail.latestEvents.length > 0
                ? auditTrail.latestEvents.slice(0, 5).map(renderAuditEntry)
                : <li className="insight-empty">No audit events captured yet.</li>}
            </ul>
          ) : (
            <p className="empty-copy">Audit trail unavailable.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Governance status</p>
          {governance ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Active laws</strong>
                <span>{governance.activeLawCount} · pending {governance.pendingProposalCount}</span>
              </li>
              <li className="insight-item">
                <strong>Law hash</strong>
                <span>{governance.lawHash}</span>
              </li>
              {governance.latestDebateAt ? (
                <li className="insight-item">
                  <strong>Latest debate</strong>
                  <span>{displayDate(governance.latestDebateAt)}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="empty-copy">Governance status unavailable.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Skills registry</p>
          {skillsRegistry ? (
            <ul className="insight-list">
              <li className="insight-item">
                <strong>Counts</strong>
                <span>
                  skills {skillsRegistry.activeSkillCount} active / {skillsRegistry.pendingSkillCount} pending · agents {skillsRegistry.activeAgentCount} active / {skillsRegistry.pendingAgentCount} pending
                </span>
              </li>
              {skillsRegistry.skills.length > 0
                ? skillsRegistry.skills.slice(0, 4).map(renderRegisteredSkillEntry)
                : <li className="insight-empty">No registered skills.</li>}
            </ul>
          ) : (
            <p className="empty-copy">Skills registry unavailable.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Task graph</p>
          {graphEntries.length > 0 ? (
            <ul className="insight-list task-graph-list">
              {graphEntries.map(renderTaskGraphEntry)}
            </ul>
          ) : (
            <p className="empty-copy">No tasks yet.</p>
          )}
        </article>
        <article className="insight-card">
          <p className="section-title">Recent runs</p>
          <ul className="insight-list">
            {runList.length > 0
              ? runList.map((run) => (
                <li key={run.runId} className="insight-item">
                  <strong>{runLabel(run)}</strong>
                  <span>{displayDate(run.updatedAt)}</span>
                </li>
              ))
              : <li className="insight-empty">No runs recorded yet.</li>}
          </ul>
        </article>
        <article className="insight-card">
          <p className="section-title">Artifacts</p>
          <ul className="insight-list">
            {data.artifacts.length > 0
              ? data.artifacts.slice(0, 4).map(renderArtifactEntry)
              : <li className="insight-empty">Nothing captured yet.</li>}
          </ul>
        </article>
      </div>

      <div className="insights-grid insights-grid--secondary insights-grid--compact">
        <article className="insight-card">
          <p className="section-title">Checkpoints</p>
          <ul className="insight-list">
            {data.checkpoints.length > 0
              ? data.checkpoints.slice(0, 4).map(renderCheckpointEntry)
              : <li className="insight-empty">No checkpoints stored.</li>}
          </ul>
        </article>
        <article className="insight-card">
          <p className="section-title">Budget events</p>
          <ul className="insight-list">
            {data.budgets.length > 0
              ? data.budgets.slice(0, 4).map(renderBudgetEntry)
              : <li className="insight-empty">Budget usage nominal.</li>}
          </ul>
        </article>
        <article className="insight-card">
          <p className="section-title">Assignments</p>
          <ul className="insight-list">
            {data.assignments.length > 0
              ? data.assignments.slice(0, 4).map(renderAssignmentEntry)
              : <li className="insight-empty">No agents assigned yet.</li>}
          </ul>
        </article>
        <article className="insight-card">
          <p className="section-title">Verification</p>
          <ul className="insight-list">
            {data.verifications.length > 0
              ? data.verifications.slice(0, 4).map(renderVerificationEntry)
              : <li className="insight-empty">Awaiting verification outcomes.</li>}
          </ul>
        </article>
        <article className="insight-card">
          <p className="section-title">Dependencies</p>
          <ul className="insight-list">
            {data.dependencies.length > 0
              ? data.dependencies.slice(0, 4).map(renderDependencyEntry)
              : <li className="insight-empty">No dependencies recorded yet.</li>}
          </ul>
        </article>
      </div>
    </section>
  );
}
