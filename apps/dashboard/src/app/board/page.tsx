import { cookies } from 'next/headers';

import { BoardShell } from '../../components/BoardShell';
import { UsernameGate } from '../../components/UsernameGate';
import { USERNAME_COOKIE } from '../../lib/identity';
import { getAppVersion } from '../../lib/version';
import { getProjectIdentity, listOperatorMessages, listTasks } from '../../lib/db';

export default async function BoardPage() {
  const cookieStore = await cookies();
  const username = cookieStore.get(USERNAME_COOKIE)?.value;

  if (!username) {
    return <UsernameGate />;
  }

  const project = getProjectIdentity();
  const tasks = listTasks();
  const operatorMessages = listOperatorMessages();
  const appVersion = getAppVersion();

  return (
    <BoardShell
      username={username}
      tasks={tasks}
      projectName={project.projectName}
      operatorMessages={operatorMessages}
      appVersion={appVersion}
    />
  );
}
