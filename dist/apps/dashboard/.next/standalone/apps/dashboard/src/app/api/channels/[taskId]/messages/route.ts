import { NextRequest, NextResponse } from 'next/server';

import { sendChannelMessage } from '../../../../../lib/db';
import { isValidUsername } from '../../../../../lib/identity';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json({ error: 'Missing task ID' }, { status: 400 });
  }

  const body = await request.json() as {
    username?: string;
    content?: string;
  };

  if (!body.username || !body.content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isValidUsername(body.username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  const result = await sendChannelMessage({
    taskId,
    username: body.username,
    content: body.content,
  });

  return NextResponse.json(result);
}
