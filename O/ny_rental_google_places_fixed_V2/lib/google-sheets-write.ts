import { getGoogleSheetsAccessToken, googleServiceAccountConfigured, rowsFromValues } from './google-sheets';
import type { AnalyticsEvent, Lead } from './types';

const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

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

async function appendSheetRow(sheetName: string, values: string[]) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getGoogleSheetsAccessToken(WRITE_SCOPE);
  const range = encodeURIComponent(`${sheetName}!A:ZZ`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [values] }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
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
  await appendSheetRow('leads', leadToSheetRow(lead));
}

export async function appendAnalyticsEventToGoogleSheet(event: AnalyticsEvent) {
  await appendSheetRow('analytics_events', analyticsEventToSheetRow(event));
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
