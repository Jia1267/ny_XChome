import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { appendJsonArray, localFileStoreAllowed, readJsonArray } from '@/lib/server-store';
import { appendAnalyticsEventToGoogleSheet, googleSheetsWritableConfigured, readAnalyticsEventsFromGoogleSheet } from '@/lib/google-sheets-write';
import { missingPersistentStoreError } from '@/lib/persistence-policy';
import { clientIp, isAllowedOrigin, rateLimit } from '@/lib/api-guard';
import { validateAnalyticsEvent } from '@/lib/validation';
import type { AnalyticsEvent } from '@/lib/types';

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin authorization required' }, { status: 401 });
  }
  if (googleSheetsWritableConfigured()) {
    const events = await readAnalyticsEventsFromGoogleSheet();
    return NextResponse.json({ events, source: 'google_sheets' });
  }
  const events = await readJsonArray<AnalyticsEvent>('analytics-events.json');
  return NextResponse.json({ events, source: localFileStoreAllowed() ? 'local_file' : 'unconfigured' });
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  // Generous limit: a single active browsing session legitimately fires many
  // events. This only stops abusive floods.
  const limit = rateLimit(`analytics:${clientIp(request)}`, 600, 5 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const result = validateAnalyticsEvent(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const event = result.event;

  const storedIn: string[] = [];
  try {
    if (googleSheetsWritableConfigured()) {
      await appendAnalyticsEventToGoogleSheet(event);
      storedIn.push('google_sheets');
    }
    if (localFileStoreAllowed()) {
      await appendJsonArray<AnalyticsEvent>('analytics-events.json', event);
      storedIn.push('local_file');
    }
  } catch (error) {
    console.error('[analytics] persistence failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to record event' }, { status: 502 });
  }

  const storageError = missingPersistentStoreError('analytics', storedIn);
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: storageError.status });
  }

  return NextResponse.json({ ok: true, event, storedIn });
}
