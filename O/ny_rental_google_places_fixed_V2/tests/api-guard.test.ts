import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp, isAllowedOrigin, rateLimit } from '../lib/api-guard';

function fakeRequest(headers: Record<string, string>): Request {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  return { headers: { get: (key: string) => lower[key.toLowerCase()] ?? null } } as unknown as Request;
}

test('clientIp prefers x-forwarded-for, then x-real-ip', () => {
  assert.equal(clientIp(fakeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })), '1.2.3.4');
  assert.equal(clientIp(fakeRequest({ 'x-real-ip': '9.9.9.9' })), '9.9.9.9');
  assert.equal(clientIp(fakeRequest({})), 'unknown');
});

test('isAllowedOrigin: same-origin and no-origin allowed; unlisted cross-origin blocked', () => {
  const previous = process.env.ALLOWED_APP_ORIGINS;
  delete process.env.ALLOWED_APP_ORIGINS;

  assert.equal(isAllowedOrigin(fakeRequest({})), true); // non-browser / no Origin
  assert.equal(isAllowedOrigin(fakeRequest({ origin: 'https://site.com', host: 'site.com' })), true); // same-origin
  assert.equal(isAllowedOrigin(fakeRequest({ origin: 'https://evil.com', host: 'site.com' })), true); // no allow-list -> fail open

  process.env.ALLOWED_APP_ORIGINS = 'https://partner.com';
  assert.equal(isAllowedOrigin(fakeRequest({ origin: 'https://evil.com', host: 'site.com' })), false);
  assert.equal(isAllowedOrigin(fakeRequest({ origin: 'https://partner.com', host: 'site.com' })), true);

  if (previous === undefined) delete process.env.ALLOWED_APP_ORIGINS;
  else process.env.ALLOWED_APP_ORIGINS = previous;
});

test('rateLimit allows up to the limit, blocks beyond, and resets after the window', () => {
  const now = 1_000_000;
  const key = 'rate-test-key';
  assert.equal(rateLimit(key, 2, 1000, now).ok, true);
  assert.equal(rateLimit(key, 2, 1000, now).ok, true);
  assert.equal(rateLimit(key, 2, 1000, now).ok, false);
  assert.equal(rateLimit(key, 2, 1000, now + 1001).ok, true);
});
