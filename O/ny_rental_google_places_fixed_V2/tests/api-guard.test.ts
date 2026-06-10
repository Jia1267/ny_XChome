import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp, isAllowedOrigin, rateLimit, rateLimitShared, sharedRateLimitConfigured } from '../lib/api-guard';

function fakeRequest(headers: Record<string, string>): Request {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  return { headers: { get: (key: string) => lower[key.toLowerCase()] ?? null } } as unknown as Request;
}

test('clientIp prefers platform headers and ignores spoofable XFF prefixes', () => {
  // Platform-set headers win outright.
  assert.equal(clientIp(fakeRequest({ 'x-vercel-forwarded-for': '7.7.7.7', 'x-forwarded-for': 'spoofed, 1.2.3.4' })), '7.7.7.7');
  assert.equal(clientIp(fakeRequest({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': 'spoofed, 1.2.3.4' })), '9.9.9.9');
  // XFF fallback takes the LAST hop (appended by the trusted proxy), so a
  // client-supplied prefix cannot rotate the rate-limit key.
  assert.equal(clientIp(fakeRequest({ 'x-forwarded-for': 'spoofed-a, spoofed-b, 1.2.3.4' })), '1.2.3.4');
  assert.equal(clientIp(fakeRequest({ 'x-forwarded-for': '1.2.3.4' })), '1.2.3.4');
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

function withUpstashEnv(run: () => Promise<void>): Promise<void> {
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
  return run().finally(() => {
    if (prevUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    if (prevToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
  });
}

function fakeFetchResponse(entries: Array<{ result?: unknown; error?: string }>): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => entries })) as unknown as typeof fetch;
}

test('rateLimitShared falls back to in-memory when Upstash env is unset', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.equal(sharedRateLimitConfigured(), false);
  const result = await rateLimitShared('shared-unset-key', 2, 1000);
  assert.equal(result.ok, true);
});

test('rateLimitShared allows under the limit and blocks over it (Upstash path)', async () => {
  await withUpstashEnv(async () => {
    assert.equal(sharedRateLimitConfigured(), true);
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = fakeFetchResponse([{ result: 1 }, { result: 1 }, { result: 900 }]);
      const allowed = await rateLimitShared('shared-key', 2, 1000);
      assert.equal(allowed.ok, true);
      assert.equal(allowed.remaining, 1);

      globalThis.fetch = fakeFetchResponse([{ result: 3 }, { result: 0 }, { result: 900 }]);
      const blocked = await rateLimitShared('shared-key', 2, 1000);
      assert.equal(blocked.ok, false);
      assert.equal(blocked.retryAfterSeconds, 1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test('rateLimitShared falls back to in-memory when Upstash errors', async () => {
  await withUpstashEnv(async () => {
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
      const result = await rateLimitShared('shared-error-key', 2, 1000);
      assert.equal(result.ok, true); // first hit in the in-memory fallback bucket
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
