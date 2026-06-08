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

const TRUST_FIELDS = [
  'last_updated_at',
  'source_name',
  'source_url',
  'price_status',
  'fee_status',
  'availability_status',
  'availability_checked_at',
  'contact_id',
  'updated_by',
  'internal_notes'
];

const PHOTO_EXTRA_FIELDS = ['last_updated_at', 'source_name', 'updated_by', 'internal_notes'];
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
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are required for private Sheet setup.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
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

async function sheetsFetch(token, endpoint, init = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets request failed: ${response.status} ${text.slice(0, 260)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function parseCsv(input) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = (values[index] ?? '').trim();
    });
    return item;
  });
  return { headers, records };
}

async function readCsv(fileName) {
  return parseCsv(await fs.readFile(path.join(DATA_DIR, fileName), 'utf8'));
}

async function readCsvOptional(fileName) {
  try {
    return await readCsv(fileName);
  } catch {
    return { headers: [], records: [] };
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function safeId(value, prefix) {
  const id = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return id || `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function verificationStatus(row, sourceUrl) {
  const normalized = String(row.verification_status || '').toLowerCase();
  if (normalized.includes('official')) return 'verified';
  if (normalized.includes('provided') || normalized.includes('scrape')) return 'provided';
  return sourceUrl ? 'needs_confirmation' : 'unknown';
}

function buildingContactId(buildingId) {
  return `contact_${safeId(buildingId, 'building')}`;
}

function addTrustFields(row, kind, buildingById, unitCountByBuilding) {
  const buildingId = row.building_id || '';
  const building = buildingById?.get(buildingId);
  const sourceUrl = row.source_url || row.official_website || building?.source_url || building?.official_website || '';
  const checkedAt = row.last_updated_at || row.source_last_checked || building?.source_last_checked || '';
  const base = verificationStatus(row, sourceUrl);
  const hasFees = Boolean(row.security_deposit_amount || row.broker_fee_amount || row.amenity_fee_amount || row.utilities_policy);
  const hasAvailability = kind === 'building'
    ? (unitCountByBuilding?.get(row.building_id) || 0) > 0
    : Boolean(row.available_date);

  return {
    ...row,
    source_url: sourceUrl,
    last_updated_at: checkedAt,
    source_name: row.source_name || hostName(sourceUrl) || row.source || 'local_csv',
    price_status: row.price_status || base,
    fee_status: row.fee_status || (hasFees ? 'provided' : 'needs_confirmation'),
    availability_status: row.availability_status || (hasAvailability ? 'provided' : 'needs_confirmation'),
    availability_checked_at: row.availability_checked_at || checkedAt,
    contact_id: row.contact_id || buildingContactId(buildingId || row.building_id),
    updated_by: row.updated_by || 'system_import',
    internal_notes: row.internal_notes || ''
  };
}

function toPoiType(category) {
  const value = String(category || '').toLowerCase();
  if (value.includes('restaurant') || value.includes('food')) return 'restaurant';
  if (value.includes('grocery') || value.includes('store')) return 'grocery';
  if (value.includes('coffee') || value.includes('cafe')) return 'coffee';
  if (value.includes('transit') || value.includes('subway')) return 'subway';
  return value || 'poi';
}

function metersFromMiles(value) {
  const miles = Number.parseFloat(String(value || '0'));
  if (!Number.isFinite(miles)) return '';
  return String(Math.round(miles * 1609.344));
}

function valuesForSheet(headers, rows) {
  return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
}

function buildDataSources(rows, syncedAt) {
  const byUrl = new Map();
  rows.forEach((row) => {
    const url = row.source_url || row.official_website || row.photo_url || '';
    if (!url) return;
    const sourceName = row.source_name || hostName(url) || 'source';
    const id = `source_${safeId(sourceName, 'source')}`;
    if (byUrl.has(url)) return;
    byUrl.set(url, {
      source_id: id,
      source_name: sourceName,
      source_url: url,
      source_type: url === row.photo_url ? 'photo_url' : 'listing_source',
      owner: 'leasing_or_agent',
      refresh_cadence: '4 hours',
      last_synced_at: syncedAt,
      status: 'active',
      notes: 'Imported from local CSV during Google Sheet setup.'
    });
  });
  return [...byUrl.values()];
}

async function buildTables() {
  const syncedAt = new Date().toISOString();
  const buildingsCsv = await readCsv('buildings.csv');
  const unitsCsv = await readCsv('units.csv');
  const photosCsv = await readCsv('photos.csv');
  const nearbyCsv = await readCsvOptional('nearby_pois.csv');
  const googlePoisCsv = await readCsv('building_google_nearby_pois_500m.csv');
  const communityPoisCsv = await readCsv('community_pois.csv');

  const buildingById = new Map(buildingsCsv.records.map((row) => [row.building_id, row]));
  const unitCountByBuilding = new Map();
  unitsCsv.records.forEach((row) => {
    unitCountByBuilding.set(row.building_id, (unitCountByBuilding.get(row.building_id) || 0) + 1);
  });

  const buildings = buildingsCsv.records.map((row) => addTrustFields(row, 'building', buildingById, unitCountByBuilding));
  const units = unitsCsv.records.map((row) => addTrustFields(row, 'unit', buildingById, unitCountByBuilding));
  const photos = photosCsv.records.map((row) => {
    const sourceUrl = row.source_url || row.photo_url || '';
    return {
      ...row,
      last_updated_at: row.source_last_checked || syncedAt,
      source_name: hostName(sourceUrl) || 'photo_source',
      updated_by: 'system_import',
      internal_notes: ''
    };
  });

  const googlePois = nearbyCsv.records.length
    ? nearbyCsv.records.map((row) => ({
      ...row,
      source_url: row.source_url || '',
      last_updated_at: row.last_updated_at || row.source_last_checked || syncedAt,
      source_name: row.source_name || row.source || 'nearby_pois.csv',
      updated_by: row.updated_by || 'system_import',
      internal_notes: row.internal_notes || ''
    }))
    : googlePoisCsv.records.map((row) => ({
      ...row,
      source_url: row.source_url || '',
      last_updated_at: row.source_last_checked || syncedAt,
      source_name: row.source || 'Google Places cache',
      updated_by: 'system_import',
      internal_notes: ''
    }));
  const communityPois = nearbyCsv.records.length
    ? []
    : communityPoisCsv.records.map((row) => {
      const building = buildingById.get(row.building_id);
      return {
        poi_id: row.poi_id,
        building_id: row.building_id,
        building_name: building?.building_name || '',
        poi_type: toPoiType(row.category),
        name: row.name,
        address: row.address,
        distance_meters: metersFromMiles(row.distance_miles),
        lat: row.lat,
        lng: row.lng,
        google_place_id: '',
        rating: '',
        user_rating_count: '',
        primary_type: row.category,
        source: row.source_url || 'community_pois.csv',
        source_url: row.source_url,
        source_last_checked: row.source_last_checked,
        last_updated_at: row.source_last_checked || syncedAt,
        source_name: hostName(row.source_url) || 'community_pois.csv',
        updated_by: 'system_import',
        internal_notes: row.notes || ''
      };
    });

  const contacts = buildings.map((row) => ({
    contact_id: row.contact_id,
    contact_name: `${row.building_name || row.building_id} leasing`,
    role: 'leasing_contact',
    company: row.building_name || '',
    email: '',
    phone: '',
    wechat: '',
    source_name: row.source_name,
    source_url: row.source_url,
    building_id: row.building_id,
    last_updated_at: row.last_updated_at,
    updated_by: 'system_import',
    internal_notes: ''
  }));

  const agents = [];
  const dataSources = buildDataSources([...buildings, ...units, ...photos, ...googlePois, ...communityPois], syncedAt);
  const changeLog = [{
    change_id: `initial_import_${syncedAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    entity_type: 'other',
    entity_id: 'google_sheet_setup',
    table_name: 'all',
    row_id: 'initial_import',
    field_name: 'all',
    changed_at: syncedAt,
    changed_by: 'system_import',
    change_type: 'initial_google_sheet_setup',
    before_value: '',
    old_value: '',
    after_value: `buildings=${buildings.length}; units=${units.length}; photos=${photos.length}; nearby_pois=${googlePois.length + communityPois.length}`,
    new_value: `buildings=${buildings.length}; units=${units.length}; photos=${photos.length}; nearby_pois=${googlePois.length + communityPois.length}`,
    notes: 'Created standard Google Sheet tabs and loaded current local CSV data.'
  }];

  return {
    buildings: {
      headers: unique([...buildingsCsv.headers, ...TRUST_FIELDS]),
      rows: buildings
    },
    units: {
      headers: unique([...unitsCsv.headers, ...TRUST_FIELDS]),
      rows: units
    },
    photos: {
      headers: unique([...photosCsv.headers, ...PHOTO_EXTRA_FIELDS]),
      rows: photos
    },
    nearby_pois: {
      headers: unique([
        'poi_id',
        'building_id',
        'building_name',
        'poi_type',
        'name',
        'address',
        'distance_meters',
        'lat',
        'lng',
        'google_place_id',
        'rating',
        'user_rating_count',
        'primary_type',
        'source',
        'source_url',
        'source_last_checked',
        'last_updated_at',
        'source_name',
        'updated_by',
        'internal_notes'
      ]),
      rows: [...googlePois, ...communityPois]
    },
    contacts: {
      headers: [
        'contact_id',
        'contact_name',
        'role',
        'company',
        'email',
        'phone',
        'wechat',
        'source_name',
        'source_url',
        'building_id',
        'last_updated_at',
        'updated_by',
        'internal_notes'
      ],
      rows: contacts
    },
    agents: {
      headers: [
        'agent_id',
        'agent_name',
        'company',
        'email',
        'phone',
        'wechat',
        'role',
        'active',
        'last_updated_at',
        'source_name',
        'updated_by',
        'internal_notes'
      ],
      rows: agents
    },
    data_sources: {
      headers: [
        'source_id',
        'source_name',
        'source_url',
        'source_type',
        'owner',
        'refresh_cadence',
        'last_synced_at',
        'status',
        'notes'
      ],
      rows: dataSources
    },
    change_log: {
      headers: [
        'change_id',
        'entity_type',
        'entity_id',
        'table_name',
        'row_id',
        'field_name',
        'changed_at',
        'changed_by',
        'change_type',
        'before_value',
        'old_value',
        'after_value',
        'new_value',
        'notes'
      ],
      rows: changeLog
    }
  };
}

function sheetRange(sheetName, range = 'A:ZZ') {
  return `'${sheetName.replace(/'/g, "''")}'!${range}`;
}

async function ensureSheets(token) {
  const metadata = await sheetsFetch(token, '?fields=sheets(properties(sheetId,title))', { method: 'GET' });
  const existing = new Set((metadata.sheets || []).map((sheet) => sheet.properties.title));
  const missing = SHEET_NAMES.filter((name) => !existing.has(name));
  if (!missing.length) return { existing: [...existing], created: [] };

  await sheetsFetch(token, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } }))
    })
  });
  return { existing: [...existing], created: missing };
}

async function clearSheet(token, sheetName) {
  await sheetsFetch(token, `/values/${encodeURIComponent(sheetRange(sheetName))}:clear`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

async function writeSheet(token, sheetName, table) {
  await clearSheet(token, sheetName);
  await sheetsFetch(token, `/values/${encodeURIComponent(sheetRange(sheetName, 'A1'))}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: valuesForSheet(table.headers, table.rows)
    })
  });
}

async function main() {
  await loadEnvLocal();
  const required = ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const token = await getAccessToken();
  const tables = await buildTables();
  const ensured = await ensureSheets(token);
  for (const sheetName of SHEET_NAMES) {
    await writeSheet(token, sheetName, tables[sheetName]);
  }

  const summary = Object.fromEntries(
    SHEET_NAMES.map((name) => [name, { rows: tables[name].rows.length, columns: tables[name].headers.length }])
  );
  console.log(JSON.stringify({
    ok: true,
    createdTabs: ensured.created,
    updatedTabs: SHEET_NAMES,
    summary
  }, null, 2));
}

main().catch((error) => {
  console.error(redact(error?.stack || error?.message || error));
  process.exitCode = 1;
});
