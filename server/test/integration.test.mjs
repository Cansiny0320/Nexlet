import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApplication } from '../src/index.mjs';
import { SyncRepository } from '../src/sync.mjs';

test('PostgreSQL: accounts, device grant, isolation, conflicts, retries, quota, tombstones and deletion', async () => {
  assert.match(
    process.env.DATABASE_URL ?? '',
    /nexlet_test(?:\?|$)/,
    'Use a dedicated nexlet_test database',
  );
  const app = await createApplication({
    ...process.env,
    PUBLIC_URL: 'http://localhost:3201/nexlet',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    SYNC_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + app.server.address().port + '/nexlet';
  const ctx = await app.auth.$context;
  const users = [],
    tokens = [];
  const call = async (route, token, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(url + route, {
      method,
      headers: {
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    assert.ok(text, 'Empty response: ' + route + ' status ' + response.status);
    return { status: response.status, value: JSON.parse(text) };
  };
  try {
    const devicePage = await fetch(url + '/device');
    assert.equal(devicePage.status, 200);
    assert.match(await devicePage.text(), /src="\.\/device-icon\.png"/);
    assert.match(devicePage.headers.get('content-security-policy'), /img-src 'self'/);
    const icon = await fetch(url + '/device-icon.png');
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.deepEqual(
      [...new Uint8Array(await icon.arrayBuffer()).slice(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    for (let i = 0; i < 2; i++) {
      const user = await ctx.internalAdapter.createUser({
        name: 'Fixture',
        email: randomUUID() + '@example.invalid',
        emailVerified: true,
      });
      users.push(user);
      tokens.push((await ctx.internalAdapter.createSession(user.id)).token);
    }
    assert.equal((await call('/api/sync/pull')).status, 401);
    assert.equal((await call('/api/me', tokens[0])).value.id, users[0].id);
    const m = {
      kind: 'snippets',
      id: 'fixture',
      mutationId: randomUUID(),
      schema: 1,
      baseRevision: 0,
      deleted: false,
      value: { body: 'private fixture' },
    };
    const first = await call('/api/sync/push', tokens[0], m);
    assert.equal(first.status, 200);
    assert.equal(first.value.revision, 1);
    assert.deepEqual((await call('/api/sync/push', tokens[0], m)).value, first.value);
    assert.equal((await call('/api/sync/push', tokens[0], { ...m, value: 'changed' })).status, 409);
    assert.deepEqual((await call('/api/sync/pull', tokens[1])).value.records, []);
    const [a, b] = await Promise.all(
      [1, 2].map((i) =>
        call('/api/sync/push', tokens[0], {
          ...m,
          baseRevision: 1,
          mutationId: randomUUID(),
          value: { body: 'edit' + i },
        }),
      ),
    );
    assert.equal([a, b].filter((r) => r.value.ok).length, 1);
    assert.equal([a, b].filter((r) => r.value.conflict).length, 1);
    const disk = (
      await app.pool.query('SELECT payload FROM sync_records WHERE owner=$1', [users[0].id])
    ).rows[0].payload;
    assert.equal(disk.includes(Buffer.from('edit')), false);
    const small = new SyncRepository(app.pool, app.sync.key.toString('base64'), 600);
    await assert.rejects(
      () => small.push(users[1].id, { ...m, mutationId: randomUUID(), value: 'x'.repeat(800) }),
      /quota_exceeded/,
    );
    const deleted = await call('/api/sync/push', tokens[0], {
      ...m,
      baseRevision: 2,
      mutationId: randomUUID(),
      deleted: true,
      value: null,
    });
    assert.equal(deleted.value.revision, 3);
    assert.equal((await call('/api/sync/pull?cursor=1', tokens[0])).value.records[0].deleted, true);
    assert.equal(
      (await call('/api/sync/push', tokens[0], { ...m, mutationId: randomUUID() })).value.conflict
        .deleted,
      true,
    );
    assert.equal((await call('/api/sync/pull?cursor=999', tokens[0])).status, 409);
    assert.equal((await call('/auth/device/code', null, { client_id: 'unknown' })).status, 400);
    const device = await call('/auth/device/code', null, { client_id: 'nexlet-desktop' });
    assert.equal(device.status, 200);
    assert.equal(
      (await call('/auth/device?user_code=' + device.value.user_code, tokens[0])).status,
      200,
    );
    assert.equal(
      (await call('/auth/device/approve', tokens[1], { userCode: device.value.user_code })).status,
      403,
    );
    assert.equal(
      (await call('/auth/device/approve', tokens[0], { userCode: device.value.user_code })).status,
      200,
    );
    const grant = await call('/auth/device/token', null, {
      client_id: 'nexlet-desktop',
      device_code: device.value.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    assert.equal(grant.status, 200);
    assert.equal((await call('/api/me', grant.value.access_token)).value.id, users[0].id);
    const devices = await call('/api/devices', tokens[0]);
    const current = devices.value.find((d) => d.current);
    assert.equal(JSON.stringify(devices.value).includes(tokens[0]), false);
    await call('/api/revoke', tokens[0], { id: current.id });
    assert.equal((await call('/api/me', tokens[0])).status, 401);
    assert.equal(
      (await call('/api/account', grant.value.access_token, { confirm: users[0].id }, 'DELETE'))
        .status,
      200,
    );
    assert.equal((await call('/api/me', grant.value.access_token)).status, 401);
    assert.equal(
      (await app.pool.query('SELECT count(*) FROM sync_records WHERE owner=$1', [users[0].id]))
        .rows[0].count,
      '0',
    );
  } finally {
    for (const user of users) {
      await app.pool.query('DELETE FROM session WHERE "userId"=$1', [user.id]);
      await app.pool.query('DELETE FROM "user" WHERE id=$1', [user.id]);
    }
    await new Promise((resolve) => app.server.close(resolve));
    await app.pool.end();
  }
});
