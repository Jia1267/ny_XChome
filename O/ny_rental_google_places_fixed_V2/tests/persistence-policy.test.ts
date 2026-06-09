import assert from 'node:assert/strict';
import test from 'node:test';
import { missingPersistentStoreError } from '../lib/persistence-policy';

test('production analytics writes fail when no persistent store accepts the event', () => {
  const error = missingPersistentStoreError('analytics', [], { NODE_ENV: 'production' });
  assert.equal(error?.status, 503);
});

test('production lead writes fail when no persistent store accepts the lead', () => {
  const error = missingPersistentStoreError('lead', [], { NODE_ENV: 'production' });
  assert.equal(error?.status, 503);
});

test('development can run without a configured cloud store', () => {
  assert.equal(missingPersistentStoreError('analytics', [], { NODE_ENV: 'development' }), null);
});
