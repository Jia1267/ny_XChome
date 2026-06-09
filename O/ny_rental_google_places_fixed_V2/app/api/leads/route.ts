import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { appendJsonArray, localFileStoreAllowed, readJsonArray } from '@/lib/server-store';
import { appendLeadToGoogleSheet, googleSheetsWritableConfigured, readLeadsFromGoogleSheet } from '@/lib/google-sheets-write';
import { missingPersistentStoreError } from '@/lib/persistence-policy';
import { clientIp, isAllowedOrigin, rateLimit } from '@/lib/api-guard';
import { validateLead } from '@/lib/validation';
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
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const limit = rateLimit(`leads:${clientIp(request)}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const result = validateLead(body);
  if (!result.ok) {
    if (result.silent) return NextResponse.json({ ok: true }); // honeypot tripped
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const lead = result.lead;

  const storedIn: string[] = [];
  try {
    if (googleSheetsWritableConfigured()) {
      await appendLeadToGoogleSheet(lead);
      storedIn.push('google_sheets');
    }
    if (localFileStoreAllowed()) {
      await appendJsonArray<Lead>('leads.json', lead);
      storedIn.push('local_file');
    }
  } catch (error) {
    console.error('[leads] persistence failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to save lead. Please try again.' }, { status: 502 });
  }

  const storageError = missingPersistentStoreError('lead', storedIn);
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: storageError.status });
  }

  return NextResponse.json({ ok: true, lead, storedIn });
}
