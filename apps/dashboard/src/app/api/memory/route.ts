import { NextResponse } from 'next/server';

import { pruneLongTermMemories, searchLongTermMemories } from '@shared-memory';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    action?: 'search' | 'prune';
    query?: string;
    olderThan?: string;
    maxPerProject?: number;
    projectId?: string;
  };

  try {
    switch (body.action) {
      case 'search':
        if (!body.query?.trim()) {
          return NextResponse.json({ error: 'Missing search query.' }, { status: 400 });
        }
        return NextResponse.json({
          results: searchLongTermMemories({
            query: body.query.trim(),
            projectId: body.projectId,
            limit: 8,
          }),
        });
      case 'prune':
        return NextResponse.json({
          removed: pruneLongTermMemories({
            olderThanIso: body.olderThan,
            maxPerProject: body.maxPerProject,
          }),
        });
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Memory action failed.',
    }, { status: 500 });
  }
}
