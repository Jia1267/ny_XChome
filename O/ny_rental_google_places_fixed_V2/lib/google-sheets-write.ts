import { getGoogleSheetsAccessToken, googleServiceAccountConfigured, rowsFromValues } from './google-sheets';
import type { AnalyticsEvent, Lead } from './types';

const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// Column order must match leadToSheetRow / analyticsEventToSheetRow below, and
// the header names the readers expect.
const LEAD_HEADERS = ['id', 'createdAt', 'name', 'wechat', 'school', 'budget', 'moveInDate', 'interestedUnit', 'notes', 'buildingId', 'unitId', 'source'];
const ANALYTICS_HEADERS = ['id', 'createdAt', 'type', 'buildingId', 'unitId', 'schoolId', 'budget', 'source', 'metadata'];

export function googleSheetsWritableConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_ID && googleServiceAccountConfigured());
}

export function leadToSheetRow(lead: Lead): string[] {
  return [
    lead.id,
    lead.createdAt,
    lead.name,
    lead.wechat,
    lead.school,
    lead.budget,
    lead.moveInDate,
    lead.interestedUnit,
    lead.notes,
    lead.buildingId || '',
    lead.unitId || '',
    lead.source || ''
  ];
}

export function analyticsEventToSheetRow(event: AnalyticsEvent): string[] {
  return [
    event.id,
    event.createdAt,
    event.type,
    event.buildingId || '',
    event.unitId || '',
    event.schoolId || '',
    event.budget || '',
    event.source || '',
    JSON.stringify(event.metadata || {})
  ];
}

// Creates the tab (with a header row) if it does not exist yet. Idempotent.
async function ensureSheetTab(sheetId: string, token: string, sheetName: string, headers: string[]) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title))`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!metaResponse.ok) {
    const text = await metaResponse.text();
    throw new Error(`Could not read spreadsheet metadata: ${metaResponse.status} ${text.slice(0, 160)}`);
  }
  const meta = await metaResponse.json() as { sheets?: { properties?: { title?: string } }[] };
  const exists = (meta.sheets || []).some(sheet => sheet.properties?.title === sheetName);

  if (!exists) {
    const addResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] })
    });
    if (!addResponse.ok) {
      const text = await addResponse.text();
      throw new Error(`Could not create tab "${sheetName}": ${addResponse.status} ${text.slice(0, 160)}`);
    }
  }

  // Ensure the header row is present (needed for the readers to map columns).
  const headerRange = encodeURIComponent(`${sheetName}!A1:ZZ1`);
  const headerResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${headerRange}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  const headerData = headerResponse.ok ? await headerResponse.json() as { values?: string[][] } : { values: undefined };
  if (!headerData.values?.[0]?.length) {
    const putRange = encodeURIComponent(`${sheetName}!A1`);
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${putRange}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ majorDimension: 'ROWS', values: [headers] })
    });
  }
}

// Ensures both operational tabs exist. Safe to call repeatedly.
export async function ensureOperationalTabs() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getGoogleSheetsAccessToken(WRITE_SCOPE);
  if (!token) throw new Error('Could not obtain a service-account access token.');
  await ensureSheetTab(sheetId, token, 'analytics_events', ANALYTICS_HEADERS);
  await ensureSheetTab(sheetId, token, 'leads', LEAD_HEADERS);
}

async function appendSheetRow(sheetName: string, values: string[], headers: string[]) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getGoogleSheetsAccessToken(WRITE_SCOPE);

  const doAppend = () => {
    const range = encodeURIComponent(`${sheetName}!A:ZZ`);
    return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
      cache: 'no-store'
    });
  };

  let response = await doAppend();
  if (!response.ok) {
    const text = await response.text();
    // A missing tab returns 400 "Unable to parse range". Create it and retry once.
    if (response.status === 400 && /unable to parse range/i.test(text)) {
      await ensureSheetTab(sheetId, token, sheetName, headers);
      response = await doAppend();
      if (!response.ok) {
        const retryText = await response.text();
        throw new Error(`Google Sheets append failed after creating tab: ${response.status} ${retryText.slice(0, 180)}`);
      }
      return;
    }
    throw new Error(`Google Sheets append failed: ${response.status} ${text.slice(0, 180)}`);
  }
}

async function readSheetRows(sheetName: string) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getGoogleSheetsAccessToken(WRITE_SCOPE);
  const range = encodeURIComponent(`${sheetName}!A:ZZ`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) return [];
  const data = await response.json() as { values?: string[][] };
  return rowsFromValues(data.values);
}

export async function appendLeadToGoogleSheet(lead: Lead) {
  await appendSheetRow('leads', leadToSheetRow(lead), LEAD_HEADERS);
}

export async function appendAnalyticsEventToGoogleSheet(event: AnalyticsEvent) {
  await appendSheetRow('analytics_events', analyticsEventToSheetRow(event), ANALYTICS_HEADERS);
}

export async function readLeadsFromGoogleSheet(): Promise<Lead[]> {
  const rows = await readSheetRows('leads');
  return rows.map(row => ({
    id: row.id || row.lead_id || '',
    createdAt: row.createdAt || row.created_at || '',
    name: row.name || '',
    wechat: row.wechat || row.WeChat || '',
    school: row.school || '',
    budget: row.budget || '',
    moveInDate: row.moveInDate || row.move_in_date || '',
    interestedUnit: row.interestedUnit || row.interested_unit || '',
    notes: row.notes || '',
    buildingId: row.buildingId || row.building_id || undefined,
    unitId: row.unitId || row.unit_id || undefined,
    source: row.source || undefined
  })).filter(lead => lead.id || lead.name || lead.wechat);
}

function redactSecrets(message: string) {
  return message
    .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]')
    .replace(/ya29\.[0-9A-Za-z._-]+/g, '[redacted]');
}

// Read probe that, unlike readSheetRows, throws on failure so the real reason
// (e.g. 403 permission) is visible to the admin diagnostics card.
async function probeSheetTab(sheetName: string): Promise<number> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getGoogleSheetsAccessToken(WRITE_SCOPE);
  if (!token) throw new Error('Could not obtain a service-account access token.');
  const range = encodeURIComponent(`${sheetName}!A:ZZ`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${redactSecrets(text.slice(0, 160))}`);
  }
  const data = await response.json() as { values?: string[][] };
  return rowsFromValues(data.values).length; // data rows, excluding the header row
}

export type StorageDiagnostics = {
  configured: boolean;
  analyticsRows: number | null;
  leadRows: number | null;
  error: string | null;
};

// Reads both operational tabs and reports row counts / the first error. Used by
// /admin to explain why metrics may be empty.
export async function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  if (!googleSheetsWritableConfigured()) {
    return { configured: false, analyticsRows: null, leadRows: null, error: null };
  }
  try {
    const [analyticsRows, leadRows] = await Promise.all([
      probeSheetTab('analytics_events'),
      probeSheetTab('leads')
    ]);
    return { configured: true, analyticsRows, leadRows, error: null };
  } catch (error) {
    return {
      configured: true,
      analyticsRows: null,
      leadRows: null,
      error: error instanceof Error ? redactSecrets(error.message) : 'Unknown Sheets error'
    };
  }
}

// Decisive write test: appends a clearly-labelled probe row so the admin can
// confirm the full write path works (and see the exact error if it does not).
export async function runStorageWriteProbe(): Promise<{ ok: boolean; error: string | null }> {
  if (!googleSheetsWritableConfigured()) {
    return { ok: false, error: 'Google Sheets write credentials are not configured.' };
  }
  try {
    await ensureOperationalTabs();
    await appendAnalyticsEventToGoogleSheet({
      id: `probe_${Date.now()}`,
      type: 'admin_write_test',
      createdAt: new Date().toISOString(),
      source: 'admin_diagnostics',
      metadata: { note: 'Safe to delete this row.' }
    });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? redactSecrets(error.message) : 'Unknown Sheets error' };
  }
}

export async function readAnalyticsEventsFromGoogleSheet(): Promise<AnalyticsEvent[]> {
  const rows = await readSheetRows('analytics_events');
  return rows.map(row => ({
    id: row.id || row.event_id || '',
    createdAt: row.createdAt || row.created_at || '',
    type: row.type || row.event_type || '',
    buildingId: row.buildingId || row.building_id || undefined,
    unitId: row.unitId || row.unit_id || undefined,
    schoolId: row.schoolId as AnalyticsEvent['schoolId'] || undefined,
    budget: row.budget || undefined,
    source: row.source || undefined,
    metadata: (() => {
      try {
        return JSON.parse(row.metadata || '{}') as AnalyticsEvent['metadata'];
      } catch {
        return {};
      }
    })()
  })).filter(event => event.id || event.type);
}
