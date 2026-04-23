import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';

const resolveDatabasePath = (): string =>
  process.env.DROIDSWARM_DB_PATH ?? path.resolve(process.cwd(), 'data', 'droidswarm.db');

const readProjectIdFromDatabase = (): string | null => {
  try {
    const dbPath = resolveDatabasePath();
    if (!fs.existsSync(dbPath)) {
      return null;
    }
    const database = new Database(dbPath, { readonly: true });
    const row = database
      .prepare('SELECT project_id FROM runs ORDER BY created_at DESC LIMIT 1')
      .get() as { project_id?: string } | undefined;
    database.close();
    return typeof row?.project_id === 'string' ? row.project_id : null;
  } catch {
    return null;
  }
};

export function GET(request: NextRequest) {
  const socketUrl =
    process.env.NEXT_PUBLIC_DROIDSWARM_SOCKET_URL ??
    process.env.DROIDSWARM_SOCKET_URL ??
    'ws://127.0.0.1:8765';
  const requestedProjectId = request.nextUrl.searchParams.get('projectId');
  const projectId =
    requestedProjectId ??
    process.env.NEXT_PUBLIC_DROIDSWARM_PROJECT_ID ??
    process.env.DROIDSWARM_PROJECT_ID ??
    readProjectIdFromDatabase() ??
    'droidswarm';

  return NextResponse.json({ socketUrl, projectId });
}
