import { NextResponse } from 'next/server';
import { verifyAdminRequest, verifyAdminSyncToken } from '@/lib/admin-auth';
import { googleSheetsWritableConfigured, readAnalyticsEventsFromGoogleSheet, readLeadsFromGoogleSheet } from '@/lib/google-sheets-write';
import { readJsonArray } from '@/lib/server-store';
import type { AnalyticsEvent, Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  return verifyAdminRequest(request) || verifyAdminSyncToken(request.headers.get('x-admin-sync-token'));
}

// Downloads leads + analytics as a JSON snapshot (off-machine backup). Can also be
// called by a scheduler with the x-admin-sync-token header.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Admin authorization required' }, { status: 401 });
  }

  let leads: Lead[] = [];
  let analyticsEvents: AnalyticsEvent[] = [];

  if (googleSheetsWritableConfigured()) {
    [leads, analyticsEvents] = await Promise.all([
      readLeadsFromGoogleSheet().catch(() => []),
      readAnalyticsEventsFromGoogleSheet().catch(() => [])
    ]);
  } else {
    [leads, analyticsEvents] = await Promise.all([
      readJsonArray<Lead>('leads.json'),
      readJsonArray<AnalyticsEvent>('analytics-events.json')
    ]);
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    counts: { leads: leads.length, analyticsEvents: analyticsEvents.length },
    leads,
    analyticsEvents
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nyrm-backup-${generatedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'no-store'
    }
  });
}
