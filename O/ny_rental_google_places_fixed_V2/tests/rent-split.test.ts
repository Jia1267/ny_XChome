import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAverageSplit,
  calculateWeightedSplit,
  generateOccupantOptions,
  getMatchedPrices
} from '../lib/rent-split';

test('generateOccupantOptions covers 1..bedrooms+1', () => {
  assert.deepEqual(generateOccupantOptions(0), [1]);
  assert.deepEqual(generateOccupantOptions(1), [1, 2]);
  assert.deepEqual(generateOccupantOptions(2), [1, 2, 3]);
  assert.deepEqual(generateOccupantOptions(3), [1, 2, 3, 4]);
});

test('calculateAverageSplit divides evenly', () => {
  assert.deepEqual(calculateAverageSplit(5000, 2), [2500, 2500]);
  assert.deepEqual(calculateAverageSplit(5000, 1), [5000]);
});

test('calculateWeightedSplit steps down by $200 per tier', () => {
  // One person pays the whole rent.
  assert.deepEqual(calculateWeightedSplit(5000, 1), [5000]);
  // Two people: (5000-200)/2 = 2400 base -> 2600 / 2400.
  assert.deepEqual(calculateWeightedSplit(5000, 2), [2600, 2400]);
  // Three people: matches the spec example (rounding gives 1867/1667/1467).
  assert.deepEqual(calculateWeightedSplit(5000, 3), [1867, 1667, 1467]);
});

test('getMatchedPrices returns only prices inside the budget', () => {
  assert.deepEqual(getMatchedPrices([1867, 1667, 1467], 1500, 1700), [1667, 1467]);
  assert.deepEqual(getMatchedPrices([5000], 1500, 1700), []);
});
