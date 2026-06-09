import { NextResponse } from 'next/server';
import { verifyAdminRequest, verifyAdminSyncToken } from '@/lib/admin-auth';
import { googleSheetsConfigured, syncGoogleSheetsToCache } from '@/lib/google-sheets';

function isAuthorized(request: Request) {
  if (verifyAdminRequest(request) || verifyAdminSyncToken(request.headers.get('x-admin-sync-token'))) {
    return true;
  }
  // Vercel Cron sends a GET with `Authorization: Bearer ${CRON_SECRET}`.
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

async function handleSync(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Admin authorization required' }, { status: 401 });
  }

  if (!googleSheetsConfigured()) {
    return NextResponse.json({
      error: 'Google Sheet sync is not configured. Set GOOGLE_SHEET_ID plus service account credentials in .env.local.'
    }, { status: 400 });
  }

  try {
    const cache = await syncGoogleSheetsToCache();
    return NextResponse.json({
      ok: true,
      syncedAt: cache.syncedAt,
      rows: Object.fromEntries(Object.entries(cache.sheets).map(([name, rows]) => [name, rows.length]))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheet sync failed.';
    return NextResponse.json({ error: message.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]') }, { status: 502 });
  }
}

// Manual / admin-cookie / external x-admin-sync-token trigger.
export async function POST(request: Request) {
  return handleSync(request);
}

// Vercel Cron triggers a GET (authorized via CRON_SECRET).
export async function GET(request: Request) {
  return handleSync(request);
}
