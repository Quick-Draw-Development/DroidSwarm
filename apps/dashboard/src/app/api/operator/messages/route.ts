import { NextResponse } from 'next/server';
import { validateCompliance } from '@shared-governance';

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

  const compliance = validateCompliance({
    eventType: 'dashboard.operator-message',
    actorRole: 'dashboard',
    swarmRole: process.env.DROIDSWARM_SWARM_ROLE === 'slave' ? 'slave' : 'master',
    projectId: process.env.DROIDSWARM_PROJECT_ID,
    auditLoggingEnabled: true,
    dashboardEnabled: true,
  });
  if (!compliance.ok) {
    return NextResponse.json({
      error: compliance.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '),
    }, { status: 400 });
  }

  const dispatchStatus = await sendOperatorInstruction({
    username: body.username,
    content: body.content.trim(),
  });

  return NextResponse.json({ dispatchStatus });
}
