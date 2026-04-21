import Link from 'next/link';
import { listBoardTasksForRun } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export default async function ProjectRunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;
  const tasks = listBoardTasksForRun(runId);
  return (
    <main>
      <h1>Run {runId}</h1>
      <ul>
        {tasks.map((task) => (
          <li key={task.taskId}>
            <Link href={`/projects/${projectId}/tasks/${task.taskId}`}>{task.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
