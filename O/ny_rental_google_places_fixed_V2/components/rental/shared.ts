// Shared helpers and types used across the extracted rental UI components.
// Plain module (no JSX/hooks) so it is safe to import from anywhere.

import type { CopyKey, Translate } from '@/lib/i18n';
import type { Building, PoiType, RentalUnit, TrustInfo, TrustStatus } from '@/lib/types';

export type DetailStage = 'full' | 'half';

export function statusLabel(status: TrustStatus, t: Translate) {
  return t(status);
}

export function bedroomsLabel(unit: RentalUnit) {
  if (unit.beds <= 0) return 'Studio';
  return `${unit.beds} bed`;
}

export function bathroomLabel(unit: RentalUnit) {
  return unit.baths ? `${unit.baths} bath` : 'Bath N/A';
}

export function unitTitle(unit: RentalUnit) {
  return `${unit.floorPlan || bedroomsLabel(unit)}${unit.unitNumber ? ` #${unit.unitNumber}` : ''}`;
}

export function roomLabels(unit: RentalUnit, people: number, t: Translate) {
  if (people === 1) return [t('wholeUnit')];
  const labels = [t('primaryBedroom'), t('secondBedroom'), t('thirdBedroom'), t('fourthBedroom')];
  const result: string[] = [];
  for (let index = 0; index < people; index += 1) {
    result.push(index >= unit.beds ? t('livingRoom') : labels[index] || `Bedroom ${index + 1}`);
  }
  return result;
}

export function splitMonthly(total: number, people: number, step: number) {
  if (people <= 1) return [Math.round(total)];
  const differenceTotal = step * ((people * (people - 1)) / 2);
  const base = Math.max(0, (total - differenceTotal) / people);
  return Array.from({ length: people }, (_, index) => Math.round(base + (people - 1 - index) * step));
}

export function trustItems(trust: TrustInfo, t: Translate) {
  return [
    { label: t('lastUpdated'), value: trust.lastUpdated },
    { label: t('source'), value: trust.sourceName },
    { label: t('priceVerified'), value: statusLabel(trust.priceStatus, t) },
    { label: t('feesVerified'), value: statusLabel(trust.feeStatus, t) },
    { label: t('availabilityVerified'), value: statusLabel(trust.availabilityStatus, t) },
    { label: t('availabilityChecked'), value: trust.availabilityCheckedAt },
    { label: t('contact'), value: trust.contactName }
  ];
}

export const nearbyTypeLabels = {
  restaurant: 'restaurants',
  grocery: 'grocery',
  coffee: 'coffee',
  subway: 'subway'
} as const satisfies Record<PoiType, CopyKey>;

export function nearbyPoisFor(building: Building, type?: PoiType, limit = 6) {
  const typedPois = building.pois.filter(poi => (!type || poi.type === type) && poi.distanceMeters <= 520);
  const googlePois = typedPois.filter(poi => poi.source.toLowerCase().includes('google'));
  const preferred = googlePois.length ? googlePois : typedPois;
  const seen = new Set<string>();
  return preferred
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .filter(poi => {
      const key = `${poi.type}|${poi.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
}

export function defaultDetailStageForViewport(): DetailStage {
  if (isMobileViewport()) return 'half';
  return 'full';
}
