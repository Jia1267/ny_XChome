// Advanced floor-plan matching: given a personal budget and desired bedroom
// count, find every floor plan that — under some share-group size — produces a
// per-person price inside the budget. The geographic scope (which buildings are
// in range) is decided upstream by the map's commute rings; this module only
// matches by price/bedrooms and uses an optional anchor purely for distance sort.

import { calculateWeightedSplit, generateOccupantOptions, getMatchedPrices } from './rent-split';

export type FloorPlanInput = {
  id: string;
  buildingId: string;
  buildingName: string;
  bedrooms: number;
  bathrooms?: number;
  price: number;
  sqft?: number;
  availableDate?: string;
  unitName?: string;
};

export type BuildingInput = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  schoolTags?: string[];
  floorPlans: FloorPlanInput[];
};

export type FilterCriteria = {
  minBudget: number;
  maxBudget: number;
  desiredBedrooms: number;
  // Anchor used only to compute distanceMiles for sorting (no filtering).
  distanceAnchor?: { lat: number; lng: number } | null;
  bedroomRange?: number; // bedrooms above desired to include (default 2)
};

export type MatchedOption = {
  occupants: number;
  splitType: 'average' | 'weighted';
  pricesPerPerson: number[];
  matchedPrices: number[];
  displayText: string;
};

export type MatchingResult = {
  buildingId: string;
  buildingName: string;
  address: string;
  lat: number;
  lng: number;
  floorPlanId: string;
  unitName?: string;
  bedrooms: number;
  bathrooms?: number;
  totalPrice: number;
  sqft?: number;
  availableDate?: string;
  distanceMiles: number | null;
  bestMatchedPrice: number;
  matchedOptions: MatchedOption[];
};

export type BuildingGroup = {
  buildingId: string;
  buildingName: string;
  address: string;
  lat: number;
  lng: number;
  distanceMiles: number | null;
  units: MatchingResult[];
  count: number;
  minMatchedPrice: number;
  minTotalPrice: number;
};

export type SortKey = 'recommended' | 'priceAsc' | 'priceDesc' | 'distanceAsc' | 'distanceDesc';

const MILES_PER_METER = 1 / 1609.344;

export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * radius * Math.asin(Math.sqrt(h));
  return meters * MILES_PER_METER;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(value));
}

export function budgetMidpoint(minBudget: number, maxBudget: number): number {
  const lo = Number.isFinite(minBudget) ? minBudget : maxBudget;
  const hi = Number.isFinite(maxBudget) ? maxBudget : minBudget;
  return (lo + hi) / 2;
}

export function getMatchingFloorPlans(filters: FilterCriteria, buildings: BuildingInput[]): MatchingResult[] {
  let minBudget = Number(filters?.minBudget);
  let maxBudget = Number(filters?.maxBudget);
  const hasMin = Number.isFinite(minBudget);
  const hasMax = Number.isFinite(maxBudget);
  if (!hasMin && !hasMax) return [];
  if (!hasMin) minBudget = 0;
  if (!hasMax) maxBudget = Number.POSITIVE_INFINITY;
  if (minBudget > maxBudget) {
    const swap = minBudget;
    minBudget = maxBudget;
    maxBudget = swap;
  }
  if (minBudget < 0) minBudget = 0;
  if (maxBudget <= 0) return [];

  const desired = Number.isFinite(filters?.desiredBedrooms) ? Math.max(0, Math.floor(filters.desiredBedrooms)) : 0;
  const range = Number.isFinite(filters?.bedroomRange as number) ? Math.max(0, Math.floor(filters.bedroomRange as number)) : 2;
  const minBedrooms = desired;
  const maxBedrooms = desired + range;

  const anchor = filters?.distanceAnchor
    && Number.isFinite(filters.distanceAnchor.lat)
    && Number.isFinite(filters.distanceAnchor.lng)
    ? filters.distanceAnchor
    : null;
  const mid = budgetMidpoint(minBudget, maxBudget);

  const results: MatchingResult[] = [];

  for (const building of buildings || []) {
    if (!building || !Array.isArray(building.floorPlans)) continue;
    const hasCoords = Number.isFinite(building.lat) && Number.isFinite(building.lng);
    const dist = anchor && hasCoords ? distanceMiles(anchor.lat, anchor.lng, building.lat, building.lng) : null;

    for (const fp of building.floorPlans) {
      if (!fp) continue;
      if (!Number.isFinite(fp.bedrooms)) continue;
      const bedrooms = Math.max(0, Math.floor(fp.bedrooms));
      if (bedrooms < minBedrooms || bedrooms > maxBedrooms) continue;
      if (!Number.isFinite(fp.price) || fp.price <= 0) continue;

      const matchedOptions: MatchedOption[] = [];
      for (const occupants of generateOccupantOptions(bedrooms)) {
        const pricesPerPerson = calculateWeightedSplit(fp.price, occupants);
        const matchedPrices = getMatchedPrices(pricesPerPerson, minBudget, maxBudget);
        if (!matchedPrices.length) continue;
        const lo = Math.min(...pricesPerPerson);
        const hi = Math.max(...pricesPerPerson);
        const displayText = occupants === 1
          ? `1 person: ${formatMoney(pricesPerPerson[0])}/person`
          : `${occupants} people share: ${formatMoney(lo)} - ${formatMoney(hi)}/person`;
        matchedOptions.push({ occupants, splitType: 'weighted', pricesPerPerson, matchedPrices, displayText });
      }
      if (!matchedOptions.length) continue;

      const allMatched = matchedOptions.flatMap(option => option.matchedPrices);
      const bestMatchedPrice = allMatched.reduce(
        (best, price) => (Math.abs(price - mid) < Math.abs(best - mid) ? price : best),
        allMatched[0]
      );

      results.push({
        buildingId: building.id,
        buildingName: building.name,
        address: building.address,
        lat: building.lat,
        lng: building.lng,
        floorPlanId: fp.id,
        unitName: fp.unitName,
        bedrooms,
        bathrooms: fp.bathrooms,
        totalPrice: fp.price,
        sqft: fp.sqft,
        availableDate: fp.availableDate,
        distanceMiles: dist,
        bestMatchedPrice,
        matchedOptions
      });
    }
  }

  // Default unit-level order (recommended): closest matched price, then nearer, then cheaper.
  results.sort((a, b) => {
    const pa = Math.abs(a.bestMatchedPrice - mid);
    const pb = Math.abs(b.bestMatchedPrice - mid);
    if (pa !== pb) return pa - pb;
    const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.totalPrice - b.totalPrice;
  });

  return results;
}

// Collapse per-unit results into one entry per building.
export function groupResultsByBuilding(results: MatchingResult[]): BuildingGroup[] {
  const map = new Map<string, BuildingGroup>();
  for (const result of results) {
    let group = map.get(result.buildingId);
    if (!group) {
      group = {
        buildingId: result.buildingId,
        buildingName: result.buildingName,
        address: result.address,
        lat: result.lat,
        lng: result.lng,
        distanceMiles: result.distanceMiles,
        units: [],
        count: 0,
        minMatchedPrice: Number.POSITIVE_INFINITY,
        minTotalPrice: Number.POSITIVE_INFINITY
      };
      map.set(result.buildingId, group);
    }
    group.units.push(result);
    group.count += 1;
    const matchedFloor = Math.min(...result.matchedOptions.flatMap(option => option.matchedPrices));
    if (matchedFloor < group.minMatchedPrice) group.minMatchedPrice = matchedFloor;
    if (result.totalPrice < group.minTotalPrice) group.minTotalPrice = result.totalPrice;
  }
  return [...map.values()];
}

export function sortBuildingGroups(groups: BuildingGroup[], sortBy: SortKey, mid: number): BuildingGroup[] {
  const sorted = [...groups];
  switch (sortBy) {
    case 'priceAsc':
      sorted.sort((a, b) => a.minMatchedPrice - b.minMatchedPrice);
      break;
    case 'priceDesc':
      sorted.sort((a, b) => b.minMatchedPrice - a.minMatchedPrice);
      break;
    case 'distanceAsc':
      sorted.sort((a, b) => (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY));
      break;
    case 'distanceDesc':
      sorted.sort((a, b) => (b.distanceMiles ?? Number.NEGATIVE_INFINITY) - (a.distanceMiles ?? Number.NEGATIVE_INFINITY));
      break;
    default:
      sorted.sort((a, b) => {
        const pa = Math.abs(a.minMatchedPrice - mid);
        const pb = Math.abs(b.minMatchedPrice - mid);
        if (pa !== pb) return pa - pb;
        const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
        const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return a.minTotalPrice - b.minTotalPrice;
      });
  }
  return sorted;
}
