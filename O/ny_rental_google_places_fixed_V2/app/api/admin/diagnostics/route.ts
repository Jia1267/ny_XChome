import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { getStorageDiagnostics, runStorageWriteProbe } from '@/lib/google-sheets-write';

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin authorization required' }, { status: 401 });
  }
  return NextResponse.json(await getStorageDiagnostics());
}

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin authorization required' }, { status: 401 });
  }
  const result = await runStorageWriteProbe();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
