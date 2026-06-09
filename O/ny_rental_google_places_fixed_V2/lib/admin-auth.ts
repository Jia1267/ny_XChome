import crypto from 'crypto';

export const ADMIN_COOKIE_NAME = 'nyrm_admin_session';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function adminSecret() {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  if (!isProduction()) return process.env.ADMIN_PASSWORD || 'nyrm-dev-admin-secret';
  return '';
}

export function adminSecretConfigured() {
  return Boolean(adminSecret());
}

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || (isProduction() ? '' : '123456');
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', adminSecret()).update(payload).digest('base64url');
}

function timingSafeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyAdminPassword(input: string) {
  if (!adminPassword()) return false;
  return timingSafeEqualText(input, adminPassword());
}

export function createAdminSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    iat: Math.floor(Date.now() / 1000)
  })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

export function verifyAdminSessionToken(token?: string) {
  if (!adminSecretConfigured()) return false;
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  if (!timingSafeEqualText(signature, signPayload(payload))) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string; iat?: number };
    if (parsed.role !== 'admin' || !parsed.iat) return false;
    const ageSeconds = Math.floor(Date.now() / 1000) - parsed.iat;
    return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
  } catch {
    return false;
  }
}

export function adminSessionMaxAgeSeconds() {
  return SESSION_MAX_AGE_SECONDS;
}

export function adminTokenFromCookieHeader(cookieHeader?: string | null) {
  return (cookieHeader || '')
    .split(';')
    .map(item => item.trim())
    .find(item => item.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

export function verifyAdminRequest(request: Request) {
  return verifyAdminSessionToken(adminTokenFromCookieHeader(request.headers.get('cookie')));
}

export function verifyAdminSyncToken(token?: string | null) {
  const expected = process.env.ADMIN_SYNC_TOKEN;
  if (!expected || !token) return false;
  return timingSafeEqualText(token, expected);
}
