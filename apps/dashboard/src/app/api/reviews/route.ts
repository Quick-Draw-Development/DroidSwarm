import { NextResponse } from 'next/server';

import { listCodeReviewRuns, resolveProjectLookup } from '@shared-projects';
import { runCodeReview } from '@shared-skills';

export async function GET() {
  const project = resolveProjectLookup(process.env.DROIDSWARM_PROJECT_ID);
  return NextResponse.json({
    reviews: listCodeReviewRuns({ projectId: project?.projectId ?? process.env.DROIDSWARM_PROJECT_ID }),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    prId?: string;
    project?: string;
    prBody?: string;
  };
  if (!body.prId) {
    return NextResponse.json({ error: 'Missing prId.' }, { status: 400 });
  }
  try {
    const review = runCodeReview({
      prId: body.prId,
      project: body.project,
      prBody: body.prBody,
    });
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Review failed.',
    }, { status: 500 });
  }
}
