import { NextResponse } from 'next/server';

import { listRegisteredModels, refreshModelInventory } from '@shared-models';

export async function GET() {
  return NextResponse.json({
    models: listRegisteredModels(),
  });
}

export async function POST() {
  try {
    const snapshot = refreshModelInventory();
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
