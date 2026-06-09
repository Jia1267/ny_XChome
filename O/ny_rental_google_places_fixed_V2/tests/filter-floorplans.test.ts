import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distanceMiles,
  getMatchingFloorPlans,
  groupResultsByBuilding,
  sortBuildingGroups,
  type BuildingInput
} from '../lib/filter-floorplans';

const COLUMBIA = { lat: 40.807536, lng: -73.962573 };

function exampleBuildings(): BuildingInput[] {
  return [
    {
      id: 'b-tower',
      name: 'Example Tower',
      address: '1 Example St',
      lat: COLUMBIA.lat,
      lng: COLUMBIA.lng,
      floorPlans: [
        { id: 'fp-2b', buildingId: 'b-tower', buildingName: 'Example Tower', bedrooms: 2, bathrooms: 2, price: 5000, unitName: '2B2B' }
      ]
    },
    {
      id: 'b-cheap',
      name: 'Budget House',
      address: '2 Example St',
      lat: COLUMBIA.lat + 0.01,
      lng: COLUMBIA.lng + 0.01,
      floorPlans: [
        { id: 'fp-1b', buildingId: 'b-cheap', buildingName: 'Budget House', bedrooms: 1, bathrooms: 1, price: 1650 }
      ]
    }
  ];
}

test('matches a 2B via 3-person share for a 1500-1700 budget (spec example)', () => {
  const results = getMatchingFloorPlans(
    { minBudget: 1500, maxBudget: 1700, desiredBedrooms: 1 },
    exampleBuildings()
  );
  const tower = results.find(result => result.floorPlanId === 'fp-2b');
  assert.ok(tower, 'Example Tower 2B should match');
  const threeShare = tower!.matchedOptions.find(option => option.occupants === 3);
  assert.ok(threeShare, '3-person share should be a matched option');
  assert.deepEqual(threeShare!.pricesPerPerson, [1867, 1667, 1467]);
  assert.deepEqual(threeShare!.matchedPrices, [1667, 1467]);
});

test('groups results by building and counts floor plans', () => {
  const results = getMatchingFloorPlans({ minBudget: 1500, maxBudget: 1700, desiredBedrooms: 1 }, exampleBuildings());
  const groups = groupResultsByBuilding(results);
  const tower = groups.find(group => group.buildingId === 'b-tower');
  assert.ok(tower);
  assert.equal(tower!.count, 1);
  assert.equal(tower!.units.length, 1);
});

test('bedroom range is desired..desired+2', () => {
  const buildings: BuildingInput[] = [{
    id: 'b', name: 'B', address: 'a', lat: 1, lng: 1,
    floorPlans: [
      { id: 'fp4', buildingId: 'b', buildingName: 'B', bedrooms: 4, price: 8000 }
    ]
  }];
  // desired 1 -> 1..3, so a 4B is excluded.
  assert.equal(getMatchingFloorPlans({ minBudget: 1000, maxBudget: 2000, desiredBedrooms: 1 }, buildings).length, 0);
  // desired 2 -> 2..4, so the 4B is now in range (and 8000/5 sharers can land in budget).
  assert.ok(getMatchingFloorPlans({ minBudget: 1000, maxBudget: 2000, desiredBedrooms: 2 }, buildings).length >= 1);
});

test('edge cases do not throw and return sensibly', () => {
  const buildings = exampleBuildings();
  assert.deepEqual(getMatchingFloorPlans({ minBudget: Number.NaN, maxBudget: Number.NaN, desiredBedrooms: 1 }, buildings), []);
  // min > max is swapped, still finds the same matches.
  assert.ok(getMatchingFloorPlans({ minBudget: 1700, maxBudget: 1500, desiredBedrooms: 1 }, buildings).length >= 1);
  // No price -> skipped.
  const noPrice: BuildingInput[] = [{ id: 'x', name: 'X', address: 'a', lat: 1, lng: 1, floorPlans: [{ id: 'u', buildingId: 'x', buildingName: 'X', bedrooms: 2, price: 0 }] }];
  assert.deepEqual(getMatchingFloorPlans({ minBudget: 1000, maxBudget: 9000, desiredBedrooms: 1 }, noPrice), []);
  // Missing bedrooms -> skipped.
  const noBeds: BuildingInput[] = [{ id: 'y', name: 'Y', address: 'a', lat: 1, lng: 1, floorPlans: [{ id: 'u', buildingId: 'y', buildingName: 'Y', bedrooms: Number.NaN, price: 3000 }] }];
  assert.deepEqual(getMatchingFloorPlans({ minBudget: 1000, maxBudget: 9000, desiredBedrooms: 0 }, noBeds), []);
});

test('distanceMiles is ~0 for the same point and positive otherwise', () => {
  assert.ok(distanceMiles(COLUMBIA.lat, COLUMBIA.lng, COLUMBIA.lat, COLUMBIA.lng) < 0.001);
  assert.ok(distanceMiles(40.7128, -74.006, 40.807536, -73.962573) > 5);
});

test('sortBuildingGroups orders by price ascending', () => {
  const results = getMatchingFloorPlans({ minBudget: 1000, maxBudget: 3000, desiredBedrooms: 1 }, exampleBuildings());
  const groups = sortBuildingGroups(groupResultsByBuilding(results), 'priceAsc', 2000);
  for (let i = 1; i < groups.length; i += 1) {
    assert.ok(groups[i - 1].minMatchedPrice <= groups[i].minMatchedPrice);
  }
});
