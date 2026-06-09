import assert from 'node:assert/strict';
import test from 'node:test';
import { localFileStoreAllowed } from '../lib/server-store';

test('local .data store is disabled by default in production', () => {
  assert.equal(localFileStoreAllowed({ NODE_ENV: 'production' }), false);
});

test('local .data store remains available for local development', () => {
  assert.equal(localFileStoreAllowed({ NODE_ENV: 'development' }), true);
});

test('production local .data store requires an explicit opt-in', () => {
  assert.equal(localFileStoreAllowed({ NODE_ENV: 'production', ENABLE_LOCAL_DATA_STORE: '1' }), true);
});
