import { NextResponse } from 'next/server';

import { listRalphWorkerSessions } from '@shared-projects';
import { startRalphWorker } from '@shared-skills';

export async function GET() {
  return NextResponse.json({
    sessions: listRalphWorkerSessions().slice(0, 16),
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { goal?: string; projectId?: string };
    if (!payload.goal || payload.goal.trim().length === 0) {
      return NextResponse.json({ error: 'Missing goal.' }, { status: 400 });
    }
    const projectId = payload.projectId ?? process.env.DROIDSWARM_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
    }
    const session = startRalphWorker({
      projectId,
      goal: payload.goal.trim(),
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to start Ralph worker.',
    }, { status: 500 });
  }
}
