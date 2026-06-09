import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { appendJsonArray, localFileStoreAllowed, readJsonArray } from '@/lib/server-store';
import { appendLeadToGoogleSheet, googleSheetsWritableConfigured, readLeadsFromGoogleSheet } from '@/lib/google-sheets-write';
import { missingPersistentStoreError } from '@/lib/persistence-policy';
import type { Lead } from '@/lib/types';

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin authorization required' }, { status: 401 });
  }
  if (googleSheetsWritableConfigured()) {
    const leads = await readLeadsFromGoogleSheet();
    return NextResponse.json({ leads, source: 'google_sheets' });
  }
  const leads = await readJsonArray<Lead>('leads.json');
  return NextResponse.json({ leads, source: localFileStoreAllowed() ? 'local_file' : 'unconfigured' });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Partial<Lead> | null;
  if (!body?.name || !body?.wechat) {
    return NextResponse.json({ error: 'Name and WeChat are required' }, { status: 400 });
  }

  const lead: Lead = {
    id: body.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    name: String(body.name),
    wechat: String(body.wechat),
    school: String(body.school || ''),
    budget: String(body.budget || ''),
    moveInDate: String(body.moveInDate || ''),
    interestedUnit: String(body.interestedUnit || ''),
    notes: String(body.notes || ''),
    buildingId: body.buildingId,
    unitId: body.unitId,
    source: body.source || 'site_lead_form'
  };

  const storedIn: string[] = [];

  if (googleSheetsWritableConfigured()) {
    await appendLeadToGoogleSheet(lead);
    storedIn.push('google_sheets');
  }

  if (localFileStoreAllowed()) {
    await appendJsonArray<Lead>('leads.json', lead);
    storedIn.push('local_file');
  }

  const storageError = missingPersistentStoreError('lead', storedIn);
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: storageError.status });
  }

  return NextResponse.json({ ok: true, lead, storedIn });
}
