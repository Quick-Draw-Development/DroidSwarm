import { NextResponse } from 'next/server';

import { createTask } from '../../../lib/db';
import { isValidUsername } from '../../../lib/identity';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as {
    title?: string;
    description?: string;
    taskType?: 'feature' | 'bug' | 'task';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    username?: string;
  };

  if (!body.title || !body.description || !body.taskType || !body.priority || !body.username) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isValidUsername(body.username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  const task = await createTask({
    title: body.title,
    description: body.description,
    taskType: body.taskType,
    priority: body.priority,
    username: body.username,
  });

  return NextResponse.json({ task });
}
