import { cache } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import { parseCsv } from './csv';
import { dateLabel, hostName, nullableMoney, splitList, toNumber } from './format';
import type { Building, NearbyPoi, Photo, PoiType, RentalDataset, RentalUnit, School, TrustInfo, TrustStatus } from './types';

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
  contactName?: string;
}): TrustInfo {
  const base = verificationToStatus(params.verificationStatus, params.sourceUrl);
  return {
    lastUpdated: dateLabel(params.sourceLastChecked),
    sourceName: hostName(params.sourceUrl),
    sourceUrl: params.sourceUrl,
    priceStatus: params.priceStatus ?? base,
    feeStatus: params.feeStatus ?? (base === 'verified' ? 'needs_confirmation' : base),
    contactName: params.contactName || 'Leasing office',
    contactMethod: params.sourceUrl ? 'Official site / agent follow-up' : 'Ask agent',
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
  const sourceLastChecked = row.source_last_checked;
  const verificationStatus = row.verification_status;
  const verificationNotes = row.verification_notes;
  const maxPeople = maxPeopleForBeds(beds);
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
    trust: trustInfo({
      sourceUrl,
      sourceLastChecked,
      verificationStatus,
      verificationNotes,
      priceStatus: verificationToStatus(verificationStatus, sourceUrl),
      feeStatus: row.broker_fee_amount || row.amenity_fee_amount || row.security_deposit_amount ? 'provided' : 'needs_confirmation',
      contactName: 'Unit leasing contact'
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
  const sourceLastChecked = row.source_last_checked;
  const verificationStatus = row.verification_status;
  const verificationNotes = row.verification_notes;
  const startingRent = rents.length ? rents[0] : null;
  const rentRange = rents.length ? `$${rents[0].toLocaleString()} - $${rents[rents.length - 1].toLocaleString()}` : 'Ask agent';

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
    trust: trustInfo({
      sourceUrl,
      sourceLastChecked,
      verificationStatus,
      verificationNotes,
      priceStatus: rents.length ? verificationToStatus(verificationStatus, sourceUrl) : 'needs_confirmation',
      feeStatus: row.utilities_policy ? 'provided' : 'needs_confirmation',
      contactName: `${row.building_name} leasing`
    }),
    units: buildingUnits,
    photos: photos.filter(photo => photo.buildingId === row.building_id),
    pois: pois.filter(poi => poi.buildingId === row.building_id),
    startingRent,
    rentRange
  };
}

export const getRentalDataset = cache(async (): Promise<RentalDataset> => {
  const [buildingRows, unitRows, photoRows, googlePoiRows, communityPoiRows] = await Promise.all([
    readRows('buildings.csv'),
    readRows('units.csv'),
    readRows('photos.csv'),
    readRows('building_google_nearby_pois_500m.csv'),
    readRows('community_pois.csv')
  ]);

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

  const lastDataUpdate = [...buildings.map(item => item.sourceLastChecked), ...units.map(item => item.sourceLastChecked)]
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
    summary: {
      buildingCount: buildings.length,
      unitCount: units.length,
      poiCount: pois.length,
      lastDataUpdate
    }
  };
});
