import assert from 'node:assert/strict';
import test from 'node:test';
import { adminPassword, adminSecretConfigured, verifyAdminPassword } from '../lib/admin-auth';

function withEnv<T>(env: Partial<NodeJS.ProcessEnv>, callback: () => T): T {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET
  };
  try {
    for (const key of Object.keys(previous)) delete process.env[key];
    Object.assign(process.env, env);
    return callback();
  } finally {
    for (const key of Object.keys(previous)) delete process.env[key];
    Object.entries(previous).forEach(([key, value]) => {
      if (value !== undefined) process.env[key] = value;
    });
  }
}

test('production admin password has no weak default fallback', () => {
  withEnv({ NODE_ENV: 'production' }, () => {
    assert.equal(adminPassword(), '');
    assert.equal(verifyAdminPassword('123456'), false);
  });
});

test('production admin session secret must be explicitly configured', () => {
  withEnv({ NODE_ENV: 'production', ADMIN_PASSWORD: 'strong-password' }, () => {
    assert.equal(adminSecretConfigured(), false);
  });
});

test('development keeps the local admin default for convenience', () => {
  withEnv({ NODE_ENV: 'development' }, () => {
    assert.equal(adminPassword(), '123456');
  });
});
