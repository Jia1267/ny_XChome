// Lightweight request guards for public API routes: client IP, origin allow-list,
// and an in-memory rate limiter.
//
// NOTE: the rate limiter is in-memory and therefore PER-INSTANCE. On Vercel's
// serverless runtime each instance keeps its own counters and they reset on cold
// start, so this is best-effort abuse mitigation, not a hard global limit. For a
// shared, durable limiter upgrade to Vercel KV / Upstash (see MAINTENANCE_PLAN.md
// 1.1 and DEVELOPMENT_ROADMAP.md Phase 1.2).

// Client-supplied X-Forwarded-For chains are trivially spoofable (the attacker
// controls everything except what the trusted proxy APPENDS), so prefer headers
// the platform itself sets, and when falling back to X-Forwarded-For use the
// LAST hop — the entry appended by the nearest trusted proxy — not the first.
export function clientIp(request: Request): string {
  const vercel = request.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map(item => item.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return 'unknown';
}

// Same-origin requests are always allowed. Cross-origin requests are allowed only
// when listed in ALLOWED_APP_ORIGINS. When the allow-list is unset we do NOT block,
// so a missing/misconfigured env var can never silently break the site's own calls.
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser clients or same-origin requests without Origin

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const host = request.headers.get('host');
  if (host && parsed.host === host) return true; // same-origin is always allowed

  const allow = (process.env.ALLOWED_APP_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!allow.length) return true; // not configured -> do not block

  return allow.includes(origin) || allow.includes(parsed.origin);
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  pruneBuckets(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

// Bound memory in long-lived instances by dropping expired buckets.
function pruneBuckets(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// --- Shared (cross-instance) rate limiting via Upstash Redis REST ---
//
// Zero npm dependencies: Upstash exposes plain HTTPS endpoints, so a fetch()
// pipeline of INCR + PEXPIRE(NX) + PTTL implements a fixed-window counter that
// every serverless instance shares. Enabled when UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set; otherwise (and on any Upstash error) this
// falls back to the per-instance in-memory limiter above, so the request path
// never breaks because the limiter is down.

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function sharedRateLimitConfigured(): boolean {
  return Boolean(upstashConfig());
}

type UpstashPipelineEntry = { result?: unknown; error?: string };

export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const config = upstashConfig();
  if (!config) return rateLimit(key, limit, windowMs);

  try {
    const redisKey = `rl:${key}`;
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, String(windowMs), 'NX'],
        ['PTTL', redisKey]
      ]),
      // A slow limiter must not stall the request path.
      signal: AbortSignal.timeout(2000)
    });
    if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
    const entries = await response.json() as UpstashPipelineEntry[];
    const failed = entries.find(entry => entry.error);
    if (failed) throw new Error(failed.error);

    const count = Number(entries[0]?.result ?? 0);
    const ttlMs = Number(entries[2]?.result ?? windowMs);
    if (count > limit) {
      const waitMs = ttlMs > 0 ? ttlMs : windowMs;
      return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }
    return { ok: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
  } catch (error) {
    console.error('[rate-limit] shared limiter unavailable, using in-memory fallback:', error instanceof Error ? error.message : error);
    return rateLimit(key, limit, windowMs);
  }
}
