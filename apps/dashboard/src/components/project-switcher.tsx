import Link from 'next/link';
import type { ProjectSummary } from '../lib/types';

export function ProjectSwitcher({ projects }: { projects: ProjectSummary[] }) {
  return (
    <nav>
      <h2>Projects</h2>
      <ul>
        {projects.map((project) => (
          <li key={project.projectId}>
            <Link href={`/projects/${project.projectId}`}>{project.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
