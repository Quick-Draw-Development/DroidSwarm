import { listProjects } from '../../lib/db';
import { ProjectSwitcher } from '../../components/project-switcher';

export default function ProjectsPage() {
  const projects = listProjects();
  return (
    <main>
      <h1>DroidSwarm Projects</h1>
      <ProjectSwitcher projects={projects} />
    </main>
  );
}
