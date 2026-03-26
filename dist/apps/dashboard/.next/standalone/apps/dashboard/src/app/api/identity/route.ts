import { NextResponse } from 'next/server';

import { isValidUsername, USERNAME_COOKIE } from '../../../lib/identity';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as { username?: string };
  const username = body.username?.trim() ?? '';

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(USERNAME_COOKIE, username, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
