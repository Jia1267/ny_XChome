import assert from 'node:assert/strict';
import test from 'node:test';
import { toInitialRentalDataset } from '../lib/public-dataset';
import type { RentalDataset } from '../lib/types';

function minimalDataset(): RentalDataset {
  const trust = {
    lastUpdated: '2026-06-01',
    sourceName: 'source',
    sourceUrl: 'https://example.com',
    priceStatus: 'verified' as const,
    feeStatus: 'provided' as const,
    availabilityStatus: 'provided' as const,
    availabilityCheckedAt: '2026-06-01',
    contactId: 'c1',
    contactName: 'Agent',
    contactMethod: 'email',
    updatedBy: 'admin',
    internalNotes: 'private',
    verificationNote: 'checked'
  };
  const photo = {
    id: 'p1',
    buildingId: 'b1',
    unitId: 'u1',
    type: 'floor_plan',
    url: 'https://images.example.com/floor.jpg',
    caption: 'floor',
    sourceUrl: 'https://example.com',
    sourceLastChecked: '2026-06-01'
  };
  const unit = {
    id: 'u1',
    buildingId: 'b1',
    unitNumber: '10A',
    floorPlan: '1 bed',
    beds: 1,
    baths: '1',
    sqft: '700',
    floor: '10',
    grossRent: 4200,
    netEffectiveRent: 4000,
    leaseTerm: '12',
    availableDate: '2026-07-01',
    concession: '',
    defaultPeople: 1,
    maxPeople: 2,
    rentStepDifference: 200,
    securityDepositAmount: 4200,
    brokerFeeAmount: null,
    amenityFeeAmount: null,
    utilitiesEstimateMonthly: 180,
    sourceUrl: 'https://example.com',
    sourceLastChecked: '2026-06-01',
    verificationStatus: 'official',
    verificationNotes: '',
    lastUpdatedAt: '2026-06-01',
    sourceName: 'source',
    priceStatus: 'verified' as const,
    feeStatus: 'provided' as const,
    availabilityStatus: 'provided' as const,
    availabilityCheckedAt: '2026-06-01',
    contactId: 'c1',
    updatedBy: 'admin',
    internalNotes: 'private',
    trust,
    photos: [photo]
  };
  const poi = {
    id: 'poi1',
    buildingId: 'b1',
    buildingName: 'Demo Building',
    type: 'coffee' as const,
    name: 'Coffee',
    address: '1 Main St',
    distanceMeters: 100,
    lat: 40.1,
    lng: -73.9,
    rating: 4.5,
    userRatingCount: 50,
    source: 'Google',
    sourceLastChecked: '2026-06-01'
  };
  const building = {
    id: 'b1',
    name: 'Demo Building',
    address: '1 Main St',
    cityArea: 'Manhattan',
    neighborhood: 'Morningside',
    city: 'New York',
    state: 'NY',
    zip: '10025',
    lat: 40.1,
    lng: -73.9,
    officialWebsite: 'https://example.com',
    availabilityUrl: 'https://example.com/availability',
    description: 'Long marketing copy',
    buildingType: 'Rental',
    unitCount: 1,
    leaseTermDefault: '12',
    utilitiesPolicy: 'Ask',
    amenities: ['gym'],
    securityFeatures: 'doorman',
    petPolicy: 'cats',
    parkingInfo: '',
    transitSummary: 'near subway',
    nearbySummary: 'near coffee',
    primaryPhotoUrl: 'https://images.example.com/building.jpg',
    sourceUrl: 'https://example.com',
    sourceLastChecked: '2026-06-01',
    verificationStatus: 'official',
    verificationNotes: '',
    lastUpdatedAt: '2026-06-01',
    sourceName: 'source',
    priceStatus: 'verified' as const,
    feeStatus: 'provided' as const,
    availabilityStatus: 'provided' as const,
    availabilityCheckedAt: '2026-06-01',
    contactId: 'c1',
    updatedBy: 'admin',
    internalNotes: 'private',
    trust,
    units: [unit],
    photos: [photo],
    pois: [poi],
    startingRent: 4200,
    rentRange: '$4,200 - $4,200'
  };
  return {
    generatedAt: '2026-06-08T00:00:00.000Z',
    schools: [],
    buildings: [building],
    units: [unit],
    photos: [photo],
    pois: [poi],
    contacts: [],
    agents: [],
    dataSources: [],
    changeLog: [],
    summary: {
      buildingCount: 1,
      unitCount: 1,
      poiCount: 1,
      lastDataUpdate: '2026-06-01'
    }
  };
}

test('initial dataset keeps building summaries but removes heavy detail arrays', () => {
  const initial = toInitialRentalDataset(minimalDataset());
  assert.equal(initial.buildings.length, 1);
  assert.equal(initial.summary.unitCount, 1);
  assert.equal(initial.summary.poiCount, 1);
  assert.deepEqual(initial.units, []);
  assert.deepEqual(initial.photos, []);
  assert.deepEqual(initial.pois, []);
  assert.deepEqual(initial.buildings[0].units, []);
  assert.deepEqual(initial.buildings[0].photos, []);
  assert.deepEqual(initial.buildings[0].pois, []);
});
