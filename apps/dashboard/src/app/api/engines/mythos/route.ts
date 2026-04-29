import { NextResponse } from 'next/server';

import { bootstrapMythosRuntime, inspectMythosRuntime, setMythosLoopCount } from '@mythos-engine';

export async function GET() {
  return NextResponse.json({
    status: await inspectMythosRuntime(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: 'bootstrap' | 'loops';
      engineId?: string;
      count?: number;
    };
    if (body.action === 'loops' && body.engineId && typeof body.count === 'number') {
      return NextResponse.json({
        status: await setMythosLoopCount(body.engineId, body.count),
      });
    }
    return NextResponse.json({
      status: await bootstrapMythosRuntime(),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Mythos engine action failed.',
    }, { status: 500 });
  }
}
