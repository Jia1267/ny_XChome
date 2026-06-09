import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsEventToSheetRow, leadToSheetRow } from '../lib/google-sheets-write';

test('lead rows preserve the contact fields needed by Google Sheets', () => {
  const row = leadToSheetRow({
    id: 'lead_1',
    createdAt: '2026-06-08T12:00:00.000Z',
    name: 'Jane',
    wechat: 'jane-wechat',
    school: 'nyu',
    budget: '$3500',
    moveInDate: '2026-08-01',
    interestedUnit: '10A',
    notes: 'prefers elevator',
    buildingId: 'b1',
    unitId: 'u1',
    source: 'mobile_lead_modal'
  });
  assert.deepEqual(row, [
    'lead_1',
    '2026-06-08T12:00:00.000Z',
    'Jane',
    'jane-wechat',
    'nyu',
    '$3500',
    '2026-08-01',
    '10A',
    'prefers elevator',
    'b1',
    'u1',
    'mobile_lead_modal'
  ]);
});

test('analytics rows serialize metadata as JSON for sheet append', () => {
  const row = analyticsEventToSheetRow({
    id: 'evt_1',
    type: 'building_click',
    createdAt: '2026-06-08T12:00:00.000Z',
    buildingId: 'b1',
    source: 'home',
    metadata: { mode: 'life' }
  });
  assert.equal(row[0], 'evt_1');
  assert.equal(row[1], '2026-06-08T12:00:00.000Z');
  assert.equal(row[2], 'building_click');
  assert.equal(row[3], 'b1');
  assert.equal(row[8], '{"mode":"life"}');
});
