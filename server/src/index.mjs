import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from './auth.mjs';
import { SyncRepository, SyncError } from './sync.mjs';
import { capacityGuard } from './capacity.mjs';

export async function createApplication(env) {
  for (const name of ['DATABASE_URL', 'PUBLIC_URL', 'BETTER_AUTH_SECRET', 'SYNC_ENCRYPTION_KEY'])
    if (!env[name]) throw new Error('Missing configuration: ' + name);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, statement_timeout: 15000 });
  const auth = createAuth(pool, env),
    sync = new SyncRepository(pool, env.SYNC_ENCRYPTION_KEY);
  const migration = await getMigrations(auth.options);
  await migration.runMigrations();
  await sync.migrate();
  const checkCapacity = capacityGuard(pool);
  const base = env.PUBLIC_URL.replace(/\/$/, ''),
    prefix = new URL(base).pathname;
  const html = await readFile(new URL('./device.html', import.meta.url));
  const script = await readFile(new URL('./device.js', import.meta.url));
  const rates = new Map();
  const reply = (res, status, value) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    try {
      const url = new URL(req.url, base),
        route = url.pathname.slice(prefix.length);
      if (!url.pathname.startsWith(prefix + '/')) throw new SyncError(404, 'not_found');
      if (route === '/health' && req.method === 'GET') {
        await pool.query('SELECT 1');
        return reply(res, 200, {
          ok: true,
          loginConfigured: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
        });
      }
      const identity = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown');
      const minute = Math.floor(Date.now() / 60000),
        bucket = rates.get(identity) ?? { minute, count: 0 };
      if (bucket.minute !== minute) {
        bucket.minute = minute;
        bucket.count = 0;
      }
      bucket.count++;
      rates.set(identity, bucket);
      if (rates.size > 10000)
        for (const [key, value] of rates) if (value.minute !== minute) rates.delete(key);
      if (bucket.count > 180 || rates.size > 20000) throw new SyncError(429, 'rate_limited');
      if (req.method === 'GET' && (route === '/device' || route === '/device.js')) {
        res.writeHead(200, {
          'content-type': route.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'text/html; charset=utf-8',
        });
        return res.end(route.endsWith('.js') ? script : html);
      }
      let body;
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 12 * 1024 * 1024) throw new SyncError(413, 'request_too_large');
        chunks.push(chunk);
      }
      if (length) body = Buffer.concat(chunks);
      if (route.startsWith('/auth/')) {
        if (body?.length > 64 * 1024) throw new SyncError(413, 'request_too_large');
        const request = new Request(base + route + url.search, {
          method: req.method,
          headers: req.headers,
          body: body ? new Uint8Array(body) : undefined,
        });
        const response = await auth.handler(request);
        res.statusCode = response.status;
        for (const [key, value] of response.headers)
          if (key !== 'set-cookie') res.setHeader(key, value);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('set-cookie', cookies);
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (!/^Bearer [^\s]{20,500}$/.test(req.headers.authorization ?? ''))
        throw new SyncError(401, 'login_required');
      const headers = new Headers({ authorization: req.headers.authorization });
      const session = await auth.api.getSession({ headers });
      if (!session) throw new SyncError(401, 'session_expired');
      const owner = session.user.id;
      const input = body ? JSON.parse(body.toString('utf8')) : {};
      if (route === '/api/me' && req.method === 'GET')
        return reply(res, 200, { id: owner, name: session.user.name, image: session.user.image });
      if (route === '/api/sync/pull' && req.method === 'GET')
        return reply(res, 200, await sync.pull(owner, Number(url.searchParams.get('cursor') ?? 0)));
      if (route === '/api/sync/push' && req.method === 'POST') {
        await checkCapacity();
        return reply(res, 200, await sync.push(owner, input));
      }
      if (route === '/api/devices' && req.method === 'GET') {
        const sessions = await pool.query(
          'SELECT id,"createdAt","expiresAt","userAgent" FROM session WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "createdAt" DESC',
          [owner],
        );
        return reply(
          res,
          200,
          sessions.rows.map((row) => ({ ...row, current: row.id === session.session.id })),
        );
      }
      if (route === '/api/revoke' && req.method === 'POST') {
        if (typeof input.id !== 'string') throw new SyncError(400, 'invalid_device');
        await pool.query('DELETE FROM session WHERE "userId"=$1 AND id=$2', [owner, input.id]);
        return reply(res, 200, { ok: true });
      }
      if (route === '/api/logout' && req.method === 'POST') {
        await pool.query('DELETE FROM session WHERE "userId"=$1 AND id=$2', [
          owner,
          session.session.id,
        ]);
        return reply(res, 200, { ok: true });
      }
      if (route === '/api/account' && req.method === 'DELETE') {
        if (input.confirm !== owner) throw new SyncError(400, 'confirmation_required');
        if (Date.now() - new Date(session.session.createdAt).getTime() > 10 * 60000)
          throw new SyncError(403, 'recent_login_required');
        const db = await pool.connect();
        try {
          await db.query('BEGIN');
          await db.query('DELETE FROM session WHERE "userId"=$1', [owner]);
          await db.query('DELETE FROM account WHERE "userId"=$1', [owner]);
          await db.query('DELETE FROM "deviceCode" WHERE "userId"=$1', [owner]);
          await db.query('DELETE FROM "user" WHERE id=$1', [owner]);
          await db.query('COMMIT');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        } finally {
          db.release();
        }
        return reply(res, 200, { ok: true });
      }
      throw new SyncError(404, 'not_found');
    } catch (error) {
      if (error instanceof SyncError) reply(res, error.status, { error: error.message });
      else if (error instanceof SyntaxError) reply(res, 400, { error: 'invalid_json' });
      else {
        console.error('Request failed', error.code ?? error.name);
        reply(res, 500, { error: 'server_error' });
      }
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, pool, auth, sync };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApplication(process.env);
  app.server.listen(Number(process.env.PORT || 3201), '0.0.0.0', () =>
    console.log('Nexlet account service ready'),
  );
  const stop = () =>
    app.server.close(async () => {
      await app.pool.end();
      process.exit(0);
    });
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
