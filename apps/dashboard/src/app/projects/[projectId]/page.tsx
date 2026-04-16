import Link from 'next/link';
import { getProjectMemory, listReposForProject, listRuns } from '../../../lib/db';
import { RepoBadge } from '../../../components/repo-badge';
import { ProjectMemoryPanel } from '../../../components/project-memory-panel';

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const repos = listReposForProject(projectId);
  const memory = getProjectMemory(projectId);
  const runs = listRuns().filter((run) => {
    const metadataProjectId = typeof run.metadata?.project_id === 'string' ? run.metadata.project_id : undefined;
    return metadataProjectId === projectId || !metadataProjectId;
  });

  return (
    <main>
      <h1>Project {projectId}</h1>
      <section>
        <h2>Repos</h2>
        <ul>
          {repos.map((repo) => <li key={repo.repoId}><RepoBadge repo={repo} /></li>)}
        </ul>
      </section>
      <ProjectMemoryPanel memory={memory} />
      <section>
        <h2>Runs</h2>
        <ul>
          {runs.map((run) => (
            <li key={run.runId}>
              <Link href={`/projects/${projectId}/runs/${run.runId}`}>{run.runId}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
