import { NextResponse } from 'next/server';

export function GET() {
  const socketUrl =
    process.env.NEXT_PUBLIC_DROIDSWARM_SOCKET_URL ??
    process.env.DROIDSWARM_SOCKET_URL ??
    'ws://127.0.0.1:8765';
  const projectId =
    process.env.NEXT_PUBLIC_DROIDSWARM_PROJECT_ID ??
    process.env.DROIDSWARM_PROJECT_ID ??
    'droidswarm';

  return NextResponse.json({ socketUrl, projectId });
}
