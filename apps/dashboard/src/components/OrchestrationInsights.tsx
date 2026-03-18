import type {
  AgentAssignmentSummary,
  ArtifactSummary,
  BudgetEventSummary,
  CheckpointSummary,
  DependencySummary,
  OrchestrationInsightsData,
  RunSummary,
  RunTimelineEntry,
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

export function OrchestrationInsights({ data }: { data: OrchestrationInsightsData }) {
  const latestRun = data.runs[0];
  const runList = data.runs.slice(0, 4);
  const timeline = data.timeline.slice(0, 6);
  const graphEntries = buildTaskGraphEntries(data.tasks);
  const uniqueAgents = new Set(data.assignments.map((assignment) => assignment.agentName));
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
      </div>

      <div className="insights-grid insights-grid--secondary">
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
