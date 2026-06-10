// Next.js instrumentation hook: initializes Sentry for the matching runtime.
// Requires `experimental.instrumentationHook` on Next 14 (set in next.config.mjs).
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors from nested React Server Components (used by Next 15+; harmless on 14).
export const onRequestError = Sentry.captureRequestError;
