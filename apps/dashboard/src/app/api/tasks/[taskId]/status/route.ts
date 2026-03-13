import { NextResponse } from 'next/server';

import { isValidUsername } from '../../../../../lib/identity';
import { updateTaskStatus } from '../../../../../lib/db';
import type { BoardStatus } from '../../../../../lib/types';

const ALLOWED_STATUSES: BoardStatus[] = ['todo', 'planning', 'in_progress', 'review', 'done', 'cancelled'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await params;
  const body = await request.json() as { status?: BoardStatus; username?: string };

  if (!body.status || !ALLOWED_STATUSES.includes(body.status) || !body.username || !isValidUsername(body.username)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  await updateTaskStatus({
    taskId,
    status: body.status,
    username: body.username,
  });

  return NextResponse.json({ ok: true });
}
