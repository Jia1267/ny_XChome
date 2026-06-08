import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const SHEET_NAMES = [
  'buildings',
  'units',
  'photos',
  'nearby_pois',
  'contacts',
  'agents',
  'data_sources',
  'change_log'
];

const OUTPUT_FILES = {
  buildings: 'buildings.csv',
  units: 'units.csv',
  photos: 'photos.csv',
  nearby_pois: 'nearby_pois.csv',
  contacts: 'contacts.csv',
  agents: 'agents.csv',
  data_sources: 'data_sources.csv',
  change_log: 'change_log.csv'
};

const DATA_DIR = path.join(process.cwd(), 'data');

function parseEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  const raw = await fs.readFile(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = parseEnvValue(value);
  });
}

function redact(message) {
  let output = String(message || '');
  const secretKeys = [
    'GOOGLE_PLACES_API_KEY',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SHEETS_API_KEY',
    'ADMIN_SYNC_TOKEN',
    'ADMIN_SESSION_SECRET'
  ];
  for (const key of secretKeys) {
    const value = process.env[key];
    if (value && value.length > 4) output = output.split(value).join('[redacted]');
  }
  output = output.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted-google-api-key]');
  output = output.replace(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g, '[redacted-private-key]');
  return output;
}

function normalizePrivateKey(key) {
  return key.replace(/\\n/g, '\n');
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !privateKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are required to pull private Sheet data.');
  }

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
  const assertion = `${unsigned}.${base64Url(signer.sign(normalizePrivateKey(privateKey)))}`;

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
    throw new Error(`Google service account auth failed: ${response.status} ${text.slice(0, 220)}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error('Google service account auth did not return an access token.');
  return data.access_token;
}

function valuesToTable(values) {
  if (!values?.length) return { headers: [], rows: [] };
  const headers = values[0].map((header) => String(header || '').trim()).filter(Boolean);
  const rows = values.slice(1)
    .filter((row) => row.some((value) => String(value || '').trim()))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = String(row[index] || '').trim();
      });
      return record;
    });
  return { headers, rows };
}

async function fetchSheets(token) {
  const params = new URLSearchParams();
  SHEET_NAMES.forEach((name) => params.append('ranges', `${name}!A:ZZ`));
  params.set('majorDimension', 'ROWS');

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values:batchGet?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets fetch failed: ${response.status} ${text.slice(0, 260)}`);
  }

  const data = await response.json();
  const output = {};
  SHEET_NAMES.forEach((name, index) => {
    output[name] = valuesToTable(data.valueRanges?.[index]?.values || []);
  });
  return output;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(table) {
  const headers = table.headers;
  const lines = [headers.map(csvEscape).join(',')];
  table.rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row[header] || '')).join(','));
  });
  return `${lines.join('\r\n')}\r\n`;
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

async function backupExistingFiles(stamp) {
  const backupDir = path.join(DATA_DIR, 'backups', `google-sheet-pull-${stamp}`);
  await fs.mkdir(backupDir, { recursive: true });
  const files = [...new Set(Object.values(OUTPUT_FILES))];
  const backedUp = [];
  for (const fileName of files) {
    const sourcePath = path.join(DATA_DIR, fileName);
    try {
      await fs.copyFile(sourcePath, path.join(backupDir, fileName));
      backedUp.push(fileName);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return { backupDir, backedUp };
}

async function writeTables(tables) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const stamp = timestamp();
  const backup = await backupExistingFiles(stamp);
  const written = [];

  for (const sheetName of SHEET_NAMES) {
    const table = tables[sheetName];
    if (!table?.headers?.length) {
      written.push({ sheet: sheetName, file: OUTPUT_FILES[sheetName], rows: 0, skipped: true });
      continue;
    }
    const fileName = OUTPUT_FILES[sheetName];
    await fs.writeFile(path.join(DATA_DIR, fileName), toCsv(table), 'utf8');
    written.push({ sheet: sheetName, file: fileName, rows: table.rows.length, columns: table.headers.length });
  }

  return { backup, written };
}

async function main() {
  await loadEnvLocal();
  const required = ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

  const token = await getAccessToken();
  const tables = await fetchSheets(token);
  const result = await writeTables(tables);
  console.log(JSON.stringify({
    ok: true,
    backupDir: result.backup.backupDir,
    backedUpFiles: result.backup.backedUp,
    written: result.written
  }, null, 2));
}

main().catch((error) => {
  console.error(redact(error?.stack || error?.message || error));
  process.exitCode = 1;
});
