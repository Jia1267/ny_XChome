import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export const SHEET_NAMES = [
  'buildings',
  'units',
  'photos',
  'nearby_pois',
  'contacts',
  'agents',
  'data_sources',
  'change_log'
] as const;

export type SheetName = typeof SHEET_NAMES[number];

export type GoogleSheetCache = {
  syncedAt: string;
  sheetId: string;
  source: 'google_sheets';
  sheets: Record<SheetName, Record<string, string>[]>;
};

const STORE_DIR = path.join(process.cwd(), '.data');
const CACHE_PATH = path.join(STORE_DIR, 'google-sheets-cache.json');

function normalizePrivateKey(key: string) {
  return key.replace(/\\n/g, '\n');
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function valuesToRows(values: string[][] | undefined): Record<string, string>[] {
  if (!values?.length) return [];
  const headers = values[0].map(header => String(header || '').trim());
  return values.slice(1)
    .filter(row => row.some(value => String(value || '').trim()))
    .map(row => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = String(row[index] || '').trim();
      });
      return record;
    });
}

async function getServiceAccountAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !privateKey) return '';

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(privateKey));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google service account auth failed: ${response.status} ${text.slice(0, 180)}`);
  }

  const data = await response.json() as { access_token?: string };
  return data.access_token || '';
}

export function googleSheetsConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_ID && (
    process.env.GOOGLE_SHEETS_API_KEY ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  ));
}

export async function fetchGoogleSheetsRows(): Promise<GoogleSheetCache> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const ranges = SHEET_NAMES.map(name => `${name}!A:ZZ`);
  const params = new URLSearchParams();
  ranges.forEach(range => params.append('ranges', range));
  params.set('majorDimension', 'ROWS');

  const headers: HeadersInit = {};
  const hasServiceAccount = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  if (hasServiceAccount) {
    const token = await getServiceAccountAccessToken();
    if (!token) throw new Error('Google service account credentials are not configured.');
    headers.Authorization = `Bearer ${token}`;
  } else {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) throw new Error('Google Sheets API key or service account credentials are not configured.');
    params.set('key', apiKey);
  }

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params.toString()}`, {
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets fetch failed: ${response.status} ${text.slice(0, 180)}`);
  }

  const data = await response.json() as { valueRanges?: { range: string; values?: string[][] }[] };
  const sheets = {} as Record<SheetName, Record<string, string>[]>;
  SHEET_NAMES.forEach(name => {
    sheets[name] = [];
  });
  data.valueRanges?.forEach((range, index) => {
    const name = SHEET_NAMES[index];
    if (name) sheets[name] = valuesToRows(range.values);
  });

  return {
    syncedAt: new Date().toISOString(),
    sheetId,
    source: 'google_sheets',
    sheets
  };
}

export async function saveGoogleSheetCache(cache: GoogleSheetCache) {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

export async function syncGoogleSheetsToCache() {
  const cache = await fetchGoogleSheetsRows();
  await saveGoogleSheetCache(cache);
  return cache;
}

export async function readGoogleSheetCache(): Promise<GoogleSheetCache | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as GoogleSheetCache;
    if (!parsed?.sheets?.buildings || !parsed?.sheets?.units) return null;
    return parsed;
  } catch {
    return null;
  }
}
