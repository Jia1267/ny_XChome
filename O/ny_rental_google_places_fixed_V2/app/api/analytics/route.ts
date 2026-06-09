import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { appendJsonArray, localFileStoreAllowed, readJsonArray } from '@/lib/server-store';
import { appendAnalyticsEventToGoogleSheet, googleSheetsWritableConfigured, readAnalyticsEventsFromGoogleSheet } from '@/lib/google-sheets-write';
import { missingPersistentStoreError } from '@/lib/persistence-policy';
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
  const body = await request.json().catch(() => null) as Partial<AnalyticsEvent> | null;
  if (!body?.type) {
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
  }

  const event: AnalyticsEvent = {
    id: body.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: String(body.type),
    createdAt: body.createdAt || new Date().toISOString(),
    buildingId: body.buildingId,
    unitId: body.unitId,
    schoolId: body.schoolId,
    budget: body.budget,
    source: body.source,
    metadata: body.metadata || {}
  };

  const storedIn: string[] = [];

  if (googleSheetsWritableConfigured()) {
    await appendAnalyticsEventToGoogleSheet(event);
    storedIn.push('google_sheets');
  }

  if (localFileStoreAllowed()) {
    await appendJsonArray<AnalyticsEvent>('analytics-events.json', event);
    storedIn.push('local_file');
  }

  const storageError = missingPersistentStoreError('analytics', storedIn);
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: storageError.status });
  }

  return NextResponse.json({ ok: true, event, storedIn });
}
