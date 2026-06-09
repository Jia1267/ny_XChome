import { cache } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import { parseCsv } from './csv';
import { dateLabel, hostName, nullableMoney, splitList, toNumber } from './format';
import { readGoogleSheetCache } from './google-sheets';
import { toInitialRentalDataset, toPublicBuildingDetail, toPublicRentalDataset } from './public-dataset';
import type { Agent, Building, ChangeLogEntry, Contact, DataSource, NearbyPoi, Photo, PoiType, RentalDataset, RentalUnit, School, TrustInfo, TrustStatus } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

export const SCHOOLS: School[] = [
  { id: 'columbia', name: 'Columbia University', shortName: 'Columbia', lat: 40.807536, lng: -73.962573 },
  { id: 'nyu', name: 'New York University', shortName: 'NYU', lat: 40.729513, lng: -73.996461 },
  { id: 'baruch', name: 'Baruch College', shortName: 'Baruch', lat: 40.7402, lng: -73.9834 },
  { id: 'pratt', name: 'Pratt Institute', shortName: 'Pratt', lat: 40.6911395, lng: -73.9643559 }
];

async function readRows(fileName: string) {
  const file = await fs.readFile(path.join(DATA_DIR, fileName), 'utf8');
  return parseCsv(file);
}

async function readRowsOptional(fileName: string) {
  try {
    return await readRows(fileName);
  } catch {
    return [];
  }
}

function firstValue(row: Record<string, string>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function statusFromRow(row: Record<string, string>, key: string, fallback: TrustStatus): TrustStatus {
  const normalized = String(row[key] || '').trim().toLowerCase();
  if (normalized === 'verified' || normalized === 'confirmed') return 'verified';
  if (normalized === 'provided' || normalized === 'listed') return 'provided';
  if (normalized === 'needs_confirmation' || normalized === 'needs confirmation' || normalized === 'pending') return 'needs_confirmation';
  if (normalized === 'unknown' || normalized === 'not_listed') return 'unknown';
  return fallback;
}

function verificationToStatus(status: string, sourceUrl: string): TrustStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes('official')) return 'verified';
  if (normalized.includes('provided') || normalized.includes('scrape')) return 'provided';
  if (sourceUrl) return 'needs_confirmation';
  return 'unknown';
}

function trustInfo(params: {
  sourceUrl: string;
  sourceLastChecked: string;
  verificationStatus: string;
  verificationNotes: string;
  priceStatus?: TrustStatus;
  feeStatus?: TrustStatus;
  availabilityStatus?: TrustStatus;
  availabilityCheckedAt?: string;
  contactId?: string;
  contactName?: string;
  sourceName?: string;
  updatedBy?: string;
  internalNotes?: string;
}): TrustInfo {
  const base = verificationToStatus(params.verificationStatus, params.sourceUrl);
  return {
    lastUpdated: dateLabel(params.sourceLastChecked),
    sourceName: params.sourceName || hostName(params.sourceUrl),
    sourceUrl: params.sourceUrl,
    priceStatus: params.priceStatus ?? base,
    feeStatus: params.feeStatus ?? (base === 'verified' ? 'needs_confirmation' : base),
    availabilityStatus: params.availabilityStatus ?? base,
    availabilityCheckedAt: dateLabel(params.availabilityCheckedAt || params.sourceLastChecked),
    contactId: params.contactId || '',
    contactName: params.contactName || 'Leasing office',
    contactMethod: params.sourceUrl ? 'Official site / agent follow-up' : 'Ask agent',
    updatedBy: params.updatedBy || 'system_import',
    internalNotes: params.internalNotes || '',
    verificationNote: params.verificationNotes || 'Imported from the supplied source file.'
  };
}

function maxPeopleForBeds(beds: number): number {
  return Math.max(1, Math.floor(Math.max(0, beds)) + 1);
}

function normalizePhoto(row: Record<string, string>): Photo {
  return {
    id: row.photo_id,
    buildingId: row.building_id,
    unitId: row.unit_id,
    type: row.photo_type,
    url: row.photo_url,
    caption: row.caption,
    sourceUrl: row.source_url,
    sourceLastChecked: dateLabel(row.source_last_checked)
  };
}

function normalizeUnit(row: Record<string, string>, photos: Photo[]): RentalUnit {
  const beds = toNumber(row.beds, 0);
  const grossRent = toNumber(row.gross_rent, 0);
  const sourceUrl = row.source_url;
  const sourceLastChecked = firstValue(row, ['last_updated_at', 'source_last_checked']);
  const verificationStatus = row.verification_status;
  const verificationNotes = row.verification_notes;
  const maxPeople = maxPeopleForBeds(beds);
  const baseStatus = verificationToStatus(verificationStatus, sourceUrl);
  const priceStatus = statusFromRow(row, 'price_status', baseStatus);
  const feeStatus = statusFromRow(row, 'fee_status', row.broker_fee_amount || row.amenity_fee_amount || row.security_deposit_amount ? 'provided' : 'needs_confirmation');
  const availabilityStatus = statusFromRow(row, 'availability_status', row.available_date ? 'provided' : 'needs_confirmation');
  return {
    id: row.unit_id,
    buildingId: row.building_id,
    unitNumber: row.unit_number,
    floorPlan: row.floor_plan,
    beds,
    baths: row.baths,
    sqft: row.sqft,
    floor: row.floor,
    grossRent,
    netEffectiveRent: nullableMoney(row.net_effective_rent),
    leaseTerm: row.lease_term,
    availableDate: row.available_date,
    concession: row.concession,
    defaultPeople: Math.min(maxPeople, Math.max(1, Math.floor(toNumber(row.default_people, maxPeople)))),
    maxPeople,
    rentStepDifference: Math.max(200, toNumber(row.rent_step_difference, 200)),
    securityDepositAmount: nullableMoney(row.security_deposit_amount),
    brokerFeeAmount: nullableMoney(row.broker_fee_amount),
    amenityFeeAmount: nullableMoney(row.amenity_fee_amount),
    utilitiesEstimateMonthly: nullableMoney(row.utilities_estimate_monthly),
    sourceUrl,
    sourceLastChecked: dateLabel(sourceLastChecked),
    verificationStatus,
    verificationNotes,
    lastUpdatedAt: dateLabel(sourceLastChecked),
    sourceName: firstValue(row, ['source_name'], hostName(sourceUrl)),
    priceStatus,
    feeStatus,
    availabilityStatus,
    availabilityCheckedAt: dateLabel(firstValue(row, ['availability_checked_at', 'availability_last_checked', 'last_updated_at', 'source_last_checked'])),
    contactId: row.contact_id || '',
    updatedBy: row.updated_by || 'system_import',
    internalNotes: row.internal_notes || '',
    trust: trustInfo({
      sourceUrl,
      sourceLastChecked,
      verificationStatus,
      verificationNotes,
      priceStatus,
      feeStatus,
      availabilityStatus,
      availabilityCheckedAt: firstValue(row, ['availability_checked_at', 'availability_last_checked', 'last_updated_at', 'source_last_checked']),
      contactId: row.contact_id,
      contactName: row.contact_name || 'Unit leasing contact',
      sourceName: row.source_name,
      updatedBy: row.updated_by,
      internalNotes: row.internal_notes
    }),
    photos: photos.filter(photo => photo.unitId === row.unit_id)
  };
}

function normalizePoi(row: Record<string, string>): NearbyPoi | null {
  const rawType = (row.poi_type || row.category || '').toLowerCase();
  let type: PoiType | null = null;
  if (rawType.includes('restaurant') || rawType.includes('food')) type = 'restaurant';
  if (rawType.includes('grocery') || rawType.includes('supermarket') || rawType.includes('store')) type = 'grocery';
  if (rawType.includes('coffee') || rawType.includes('cafe')) type = 'coffee';
  if (rawType.includes('subway') || rawType.includes('transit')) type = 'subway';
  if (!type) return null;

  const distanceMetersValue = row.distance_meters
    ? toNumber(row.distance_meters, 0)
    : Math.round(toNumber(row.distance_miles, 0) * 1609.344);

  return {
    id: row.poi_id,
    buildingId: row.building_id,
    buildingName: row.building_name || '',
    type,
    name: row.name,
    address: row.address,
    distanceMeters: distanceMetersValue,
    lat: toNumber(row.lat, 0),
    lng: toNumber(row.lng, 0),
    rating: nullableMoney(row.rating),
    userRatingCount: nullableMoney(row.user_rating_count),
    source: row.source || row.source_url || 'Provided POI table',
    sourceLastChecked: dateLabel(row.source_last_checked)
  };
}

function normalizeBuilding(row: Record<string, string>, units: RentalUnit[], photos: Photo[], pois: NearbyPoi[]): Building {
  const buildingUnits = units.filter(unit => unit.buildingId === row.building_id);
  const rents = buildingUnits.map(unit => unit.grossRent).filter(rent => rent > 0).sort((a, b) => a - b);
  const sourceUrl = row.source_url || row.official_website;
  const sourceLastChecked = firstValue(row, ['last_updated_at', 'source_last_checked']);
  const verificationStatus = row.verification_status;
  const verificationNotes = row.verification_notes;
  const startingRent = rents.length ? rents[0] : null;
  const rentRange = rents.length ? `$${rents[0].toLocaleString()} - $${rents[rents.length - 1].toLocaleString()}` : 'Ask agent';
  const baseStatus = verificationToStatus(verificationStatus, sourceUrl);
  const priceStatus = statusFromRow(row, 'price_status', rents.length ? baseStatus : 'needs_confirmation');
  const feeStatus = statusFromRow(row, 'fee_status', row.utilities_policy ? 'provided' : 'needs_confirmation');
  const availabilityStatus = statusFromRow(row, 'availability_status', buildingUnits.length ? 'provided' : 'needs_confirmation');

  return {
    id: row.building_id,
    name: row.building_name,
    address: row.address,
    cityArea: row.city_area,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    zip: row.zip,
    lat: toNumber(row.lat, 0),
    lng: toNumber(row.lng, 0),
    officialWebsite: row.official_website,
    availabilityUrl: row.availability_url,
    description: row.description,
    buildingType: row.building_type,
    unitCount: toNumber(row.unit_count, buildingUnits.length),
    leaseTermDefault: row.lease_term_default,
    utilitiesPolicy: row.utilities_policy,
    amenities: splitList(row.amenities),
    securityFeatures: row.security_features,
    petPolicy: row.pet_policy,
    parkingInfo: row.parking_info,
    transitSummary: row.transit_summary,
    nearbySummary: row.nearby_summary,
    primaryPhotoUrl: row.primary_photo_url,
    sourceUrl,
    sourceLastChecked: dateLabel(sourceLastChecked),
    verificationStatus,
    verificationNotes,
    lastUpdatedAt: dateLabel(sourceLastChecked),
    sourceName: firstValue(row, ['source_name'], hostName(sourceUrl)),
    priceStatus,
    feeStatus,
    availabilityStatus,
    availabilityCheckedAt: dateLabel(firstValue(row, ['availability_checked_at', 'availability_last_checked', 'last_updated_at', 'source_last_checked'])),
    contactId: row.contact_id || '',
    updatedBy: row.updated_by || 'system_import',
    internalNotes: row.internal_notes || '',
    trust: trustInfo({
      sourceUrl,
      sourceLastChecked,
      verificationStatus,
      verificationNotes,
      priceStatus,
      feeStatus,
      availabilityStatus,
      availabilityCheckedAt: firstValue(row, ['availability_checked_at', 'availability_last_checked', 'last_updated_at', 'source_last_checked']),
      contactId: row.contact_id,
      contactName: row.contact_name || `${row.building_name} leasing`,
      sourceName: row.source_name,
      updatedBy: row.updated_by,
      internalNotes: row.internal_notes
    }),
    units: buildingUnits,
    photos: photos.filter(photo => photo.buildingId === row.building_id),
    pois: pois.filter(poi => poi.buildingId === row.building_id),
    startingRent,
    rentRange
  };
}

function normalizeContact(row: Record<string, string>): Contact {
  return {
    id: firstValue(row, ['contact_id', 'id']),
    name: firstValue(row, ['contact_name', 'name']),
    role: row.role || '',
    company: row.company || '',
    email: row.email || '',
    phone: row.phone || '',
    wechat: row.wechat || '',
    sourceName: row.source_name || '',
    internalNotes: row.internal_notes || ''
  };
}

function normalizeAgent(row: Record<string, string>): Agent {
  return {
    id: firstValue(row, ['agent_id', 'id']),
    name: firstValue(row, ['agent_name', 'name']),
    company: row.company || '',
    email: row.email || '',
    phone: row.phone || '',
    wechat: row.wechat || '',
    role: row.role || 'broker',
    active: !['false', '0', 'inactive', 'no'].includes(String(row.active || '').toLowerCase()),
    internalNotes: row.internal_notes || ''
  };
}

function normalizeDataSource(row: Record<string, string>): DataSource {
  return {
    id: firstValue(row, ['source_id', 'id']),
    name: firstValue(row, ['source_name', 'name']),
    url: firstValue(row, ['source_url', 'url']),
    sourceType: row.source_type || '',
    owner: row.owner || '',
    refreshCadence: row.refresh_cadence || '4 hours',
    lastSyncedAt: dateLabel(firstValue(row, ['last_synced_at', 'last_updated_at'])),
    status: row.status || 'active',
    notes: row.notes || ''
  };
}

function normalizeChangeLog(row: Record<string, string>): ChangeLogEntry {
  const entityType = firstValue(row, ['entity_type'], 'other') as ChangeLogEntry['entityType'];
  return {
    id: firstValue(row, ['change_id', 'id'], `change_${firstValue(row, ['changed_at'], Date.now().toString())}`),
    entityType: ['building', 'unit', 'photo', 'poi', 'contact', 'agent', 'source', 'other'].includes(entityType) ? entityType : 'other',
    entityId: row.entity_id || '',
    changedAt: dateLabel(row.changed_at),
    changedBy: row.changed_by || '',
    changeType: row.change_type || '',
    beforeValue: row.before_value || '',
    afterValue: row.after_value || '',
    notes: row.notes || ''
  };
}

export const getRentalDataset = cache(async (): Promise<RentalDataset> => {
  const sheetCache = await readGoogleSheetCache();
  const useSheetCache = Boolean(sheetCache?.sheets.buildings.length && sheetCache?.sheets.units.length);
  let buildingRows: Record<string, string>[];
  let unitRows: Record<string, string>[];
  let photoRows: Record<string, string>[];
  let googlePoiRows: Record<string, string>[];
  let communityPoiRows: Record<string, string>[];
  let contactRows: Record<string, string>[];
  let agentRows: Record<string, string>[];
  let dataSourceRows: Record<string, string>[];
  let changeLogRows: Record<string, string>[];

  if (useSheetCache && sheetCache) {
    [
      buildingRows,
      unitRows,
      photoRows,
      googlePoiRows,
      communityPoiRows,
      contactRows,
      agentRows,
      dataSourceRows,
      changeLogRows
    ] = [
      sheetCache.sheets.buildings,
      sheetCache.sheets.units,
      sheetCache.sheets.photos,
      sheetCache.sheets.nearby_pois,
      [],
      sheetCache.sheets.contacts,
      sheetCache.sheets.agents,
      sheetCache.sheets.data_sources,
      sheetCache.sheets.change_log
    ];
  } else {
    const [
      localBuildingRows,
      localUnitRows,
      localPhotoRows,
      localNearbyRows,
      localGooglePoiRows,
      localCommunityPoiRows,
      localContactRows,
      localAgentRows,
      localDataSourceRows,
      localChangeLogRows
    ] = await Promise.all([
      readRows('buildings.csv'),
      readRows('units.csv'),
      readRows('photos.csv'),
      readRowsOptional('nearby_pois.csv'),
      readRows('building_google_nearby_pois_500m.csv'),
      readRows('community_pois.csv'),
      readRowsOptional('contacts.csv'),
      readRowsOptional('agents.csv'),
      readRowsOptional('data_sources.csv'),
      readRowsOptional('change_log.csv')
    ]);
    buildingRows = localBuildingRows;
    unitRows = localUnitRows;
    photoRows = localPhotoRows;
    googlePoiRows = localNearbyRows.length ? localNearbyRows : localGooglePoiRows;
    communityPoiRows = localNearbyRows.length ? [] : localCommunityPoiRows;
    contactRows = localContactRows;
    agentRows = localAgentRows;
    dataSourceRows = localDataSourceRows;
    changeLogRows = localChangeLogRows;
  }

  const photos = photoRows.map(normalizePhoto).filter(photo => photo.url);
  const units = unitRows.map(row => normalizeUnit(row, photos)).filter(unit => unit.id && unit.grossRent > 0);
  const poiByKey = new Map<string, NearbyPoi>();
  [...googlePoiRows, ...communityPoiRows]
    .map(normalizePoi)
    .filter((poi): poi is NearbyPoi => Boolean(poi && poi.lat && poi.lng))
    .forEach(poi => {
      const key = `${poi.buildingId}|${poi.type}|${poi.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      const existing = poiByKey.get(key);
      const isGoogle = poi.source.toLowerCase().includes('google');
      const existingIsGoogle = existing?.source.toLowerCase().includes('google');
      if (!existing || (isGoogle && !existingIsGoogle) || poi.distanceMeters < existing.distanceMeters) {
        poiByKey.set(key, poi);
      }
    });
  const pois = [...poiByKey.values()];
  const buildings = buildingRows
    .map(row => normalizeBuilding(row, units, photos, pois))
    .filter(building => building.id && building.lat && building.lng && building.units.length > 0);
  const contacts = contactRows.map(normalizeContact).filter(contact => contact.id || contact.name);
  const agents = agentRows.map(normalizeAgent).filter(agent => agent.id || agent.name);
  const dataSources = dataSourceRows.map(normalizeDataSource).filter(source => source.id || source.name);
  const changeLog = changeLogRows.map(normalizeChangeLog).filter(change => change.id || change.entityId);

  const lastDataUpdate = [...buildings.map(item => item.lastUpdatedAt), ...units.map(item => item.lastUpdatedAt)]
    .filter(Boolean)
    .sort()
    .at(-1) || 'Not listed';

  return {
    generatedAt: new Date().toISOString(),
    schools: SCHOOLS,
    buildings,
    units,
    photos,
    pois,
    contacts,
    agents,
    dataSources,
    changeLog,
    summary: {
      buildingCount: buildings.length,
      unitCount: units.length,
      poiCount: pois.length,
      lastDataUpdate,
      sheetLastSyncedAt: sheetCache?.syncedAt,
      dataSourceMode: useSheetCache ? 'google_sheet_cache' : 'local_csv'
    }
  };
});

export const getPublicRentalDataset = cache(async (): Promise<RentalDataset> => {
  const dataset = await getRentalDataset();
  return toPublicRentalDataset(dataset);
});

export const getInitialPublicRentalDataset = cache(async (): Promise<RentalDataset> => {
  const dataset = await getRentalDataset();
  return toInitialRentalDataset(dataset);
});

export const getPublicBuildingDetail = cache(async (buildingId: string): Promise<Building | null> => {
  const dataset = await getRentalDataset();
  return toPublicBuildingDetail(dataset, buildingId);
});
