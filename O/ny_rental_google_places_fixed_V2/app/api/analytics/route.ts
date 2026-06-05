import { NextResponse } from 'next/server';
import { appendJsonArray, readJsonArray } from '@/lib/server-store';
import type { AnalyticsEvent } from '@/lib/types';

export async function GET() {
  const events = await readJsonArray<AnalyticsEvent>('analytics-events.json');
  return NextResponse.json({ events });
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

  await appendJsonArray<AnalyticsEvent>('analytics-events.json', event);
  return NextResponse.json({ ok: true, event });
}
