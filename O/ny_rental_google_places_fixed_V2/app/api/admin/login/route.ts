import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, adminSessionMaxAgeSeconds, createAdminSessionToken, verifyAdminPassword } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || !verifyAdminPassword(String(body.password))) {
    return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const isHttps = requestUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: adminSessionMaxAgeSeconds()
  });
  return response;
}
