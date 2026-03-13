import { NextResponse } from 'next/server';

import { listOperatorMessages, sendOperatorInstruction } from '../../../../lib/db';
import { isValidUsername } from '../../../../lib/identity';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ messages: listOperatorMessages() });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as {
    username?: string;
    content?: string;
  };

  if (!body.username || !body.content?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isValidUsername(body.username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  const dispatchStatus = await sendOperatorInstruction({
    username: body.username,
    content: body.content.trim(),
  });

  return NextResponse.json({ dispatchStatus });
}
