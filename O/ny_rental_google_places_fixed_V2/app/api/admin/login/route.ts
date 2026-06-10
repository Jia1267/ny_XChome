import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, adminSessionMaxAgeSeconds, createAdminSessionToken, verifyAdminPassword } from '@/lib/admin-auth';
import { clientIp, rateLimitShared } from '@/lib/api-guard';

export async function POST(request: Request) {
  // Brute-force guard: a real admin signs in a handful of times a day, so a
  // tight per-IP window costs nothing legitimate while capping password guesses.
  const limit = await rateLimitShared(`admin-login:${clientIp(request)}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

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
