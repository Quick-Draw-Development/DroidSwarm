'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ProjectSummary } from '../lib/types';

const buildProjectHref = (pathname: string, projectId: string): string => {
  if (pathname === '/projects') {
    return `/projects/${projectId}`;
  }
  if (pathname.startsWith('/projects/')) {
    return `/projects/${projectId}`;
  }
  return `/board?projectId=${encodeURIComponent(projectId)}`;
};

export function ProjectSwitcher({
  projects,
  selectedProjectId,
}: {
  projects: ProjectSummary[];
  selectedProjectId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProjectId = selectedProjectId ?? searchParams.get('projectId') ?? undefined;

  return (
    <nav>
      <h2>Projects</h2>
      <ul>
        {projects.map((project) => (
          <li key={project.projectId}>
            <Link
              href={buildProjectHref(pathname, project.projectId)}
              aria-current={activeProjectId === project.projectId ? 'page' : undefined}
            >
              {project.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
