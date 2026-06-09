// Lightweight request guards for public API routes: client IP, origin allow-list,
// and an in-memory rate limiter.
//
// NOTE: the rate limiter is in-memory and therefore PER-INSTANCE. On Vercel's
// serverless runtime each instance keeps its own counters and they reset on cold
// start, so this is best-effort abuse mitigation, not a hard global limit. For a
// shared, durable limiter upgrade to Vercel KV / Upstash (see MAINTENANCE_PLAN.md
// 1.1 and DEVELOPMENT_ROADMAP.md Phase 1.2).

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
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
