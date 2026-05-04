import { NextResponse } from 'next/server';

import { getBrainStatus, listBrainPromotionCandidates } from '@shared-memory';
import { runBrainDreamCycle } from '@shared-agent-brain';

export async function GET() {
  return NextResponse.json({
    status: getBrainStatus({
      projectId: process.env.DROIDSWARM_PROJECT_ID,
    }),
    candidates: listBrainPromotionCandidates({
      projectId: process.env.DROIDSWARM_PROJECT_ID,
    }).slice(0, 16),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    action?: 'dream';
  };
  if (body.action !== 'dream') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  try {
    return NextResponse.json({
      result: runBrainDreamCycle({
        projectId: process.env.DROIDSWARM_PROJECT_ID,
      }),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Dream cycle failed.',
    }, { status: 500 });
  }
}
