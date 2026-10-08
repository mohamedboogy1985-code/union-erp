import assert from 'node:assert/strict';
import test from 'node:test';
import { maybeStartEmbeddedPostgres } from '../server/db/pg-embedded.js';

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('embedded PostgreSQL stays disabled when an external SQL connection is configured', async () => {
  const byHost = await withEnv({
    DISABLE_EMBEDDED_PG: undefined,
    SQL_HOST: 'db.example.invalid',
    DATABASE_URL: undefined,
  }, () => maybeStartEmbeddedPostgres());
  assert.equal(byHost, false);

  const byUrl = await withEnv({
    DISABLE_EMBEDDED_PG: undefined,
    SQL_HOST: undefined,
    DATABASE_URL: 'postgresql://user:secret@db.example.invalid:5432/union_app',
  }, () => maybeStartEmbeddedPostgres());
  assert.equal(byUrl, false);
});

test('embedded PostgreSQL rejects public listeners without a strong password and CIDR allow-list', async () => {
  const blocked = await withEnv({
    DISABLE_EMBEDDED_PG: undefined,
    SQL_HOST: undefined,
    DATABASE_URL: undefined,
    SQL_LISTEN_ADDRESSES: '0.0.0.0',
    SQL_PASSWORD: 'postgres',
    SQL_ALLOWED_CIDRS: '0.0.0.0/0',
  }, () => maybeStartEmbeddedPostgres());
  assert.equal(blocked, false);

  const invalidCidr = await withEnv({
    DISABLE_EMBEDDED_PG: undefined,
    SQL_HOST: undefined,
    DATABASE_URL: undefined,
    SQL_LISTEN_ADDRESSES: '0.0.0.0',
    SQL_PASSWORD: 'a-strong-enough-password',
    SQL_ALLOWED_CIDRS: 'not-a-cidr',
  }, () => maybeStartEmbeddedPostgres());
  assert.equal(invalidCidr, false);
});
