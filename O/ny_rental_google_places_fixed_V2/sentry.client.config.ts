// Sentry browser-side init. Loaded by withSentryConfig's webpack injection.
// Without NEXT_PUBLIC_SENTRY_DSN the SDK is fully disabled (no network calls),
// so local dev and un-configured deploys behave exactly as before.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // Errors-only: tracing is excluded from the client bundle entirely (see
  // bundleSizeOptimizations in next.config.mjs), keeping first-paint JS small.
  tracesSampleRate: 0,
  sendDefaultPii: false
});
