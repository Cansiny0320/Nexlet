import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacityGuard } from '../src/capacity.mjs';

test('refuses writes at disk/database limits and retries after space is available', async () => {
  let bytes = 10,
    free = 9;
  const guard = capacityGuard(
    { query: async () => ({ rows: [{ bytes }] }) },
    { databaseLimit: 100, minimumFree: 10, space: async () => ({ bavail: free, bsize: 1 }) },
  );
  await assert.rejects(guard, /service_capacity_exceeded/);
  free = 20;
  bytes = 100;
  await assert.rejects(guard, /service_capacity_exceeded/);
  bytes = 50;
  await guard();
});
