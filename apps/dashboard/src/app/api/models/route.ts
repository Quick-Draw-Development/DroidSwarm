import { NextResponse } from 'next/server';

import { discoverModels, downloadDiscoveredModel, listDiscoveredModels, listRegisteredModels, refreshModelInventory } from '@shared-models';

export async function GET() {
  return NextResponse.json({
    models: listRegisteredModels(),
    discovered: listDiscoveredModels({ newOnly: false }),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { action?: string; modelId?: string };
    if (body.action === 'discover') {
      return NextResponse.json({
        discovery: await discoverModels({
          projectId: process.env.DROIDSWARM_PROJECT_ID,
          force: true,
          triggeredBy: 'dashboard',
        }),
      });
    }
    if (body.action === 'download' && body.modelId) {
      return NextResponse.json({
        model: await downloadDiscoveredModel(body.modelId, {
          triggeredBy: 'dashboard',
        }),
      });
    }
    const snapshot = refreshModelInventory();
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
