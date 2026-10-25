import { createApplication } from '../src/index.mjs';
import assert from 'node:assert/strict';
const url = new URL(process.env.DATABASE_URL);
assert.ok(['/nexlet_test', '/nexlet_restore'].includes(url.pathname));
const app = await createApplication(process.env),
  ctx = await app.auth.$context;
if (process.argv[2] === 'seed') {
  const existing = await app.pool.query('SELECT id FROM "user" WHERE id=$1', ['restore-fixture']);
  if (!existing.rows.length)
    await app.pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
      ['restore-fixture', 'Backup Fixture', 'restore@example.invalid'],
    );
  await app.sync.push('restore-fixture', {
    kind: 'snippets',
    id: 'restored',
    schema: 1,
    mutationId: 'restore-fixture-0001',
    baseRevision: 0,
    deleted: false,
    value: { text: 'encrypted backup roundtrip' },
  });
} else {
  const data = await app.sync.pull('restore-fixture', 0);
  assert.equal(data.records[0].value.text, 'encrypted backup roundtrip');
  console.log('Encrypted PostgreSQL backup restored and decrypted successfully');
}
await app.pool.end();
