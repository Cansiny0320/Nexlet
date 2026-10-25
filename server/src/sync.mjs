import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const QUOTA = 100 * 1024 * 1024;
export const KINDS = [
  'settings',
  'commands',
  'pinned',
  'webShortcuts',
  'snippets',
  'aiActions',
  'aiModels',
  'bookmarks',
  'pads',
  'notes',
  'plugins',
  'clipboardFavorites',
  'clipboardImages',
  'clipboardHistory',
];
export class SyncError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
export class SyncRepository {
  constructor(pool, encryptionKey, quota = QUOTA) {
    this.pool = pool;
    this.key = Buffer.from(encryptionKey, 'base64');
    if (this.key.length !== 32) throw new Error('SYNC_ENCRYPTION_KEY must contain 32 bytes');
    this.quota = quota;
  }
  async migrate() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sync_owners (
        owner text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
        sequence bigint NOT NULL DEFAULT 0, used bigint NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sync_records (
        owner text NOT NULL REFERENCES sync_owners(owner) ON DELETE CASCADE,
        kind text NOT NULL, id text NOT NULL, revision bigint NOT NULL,
        deleted boolean NOT NULL, payload bytea NOT NULL, size integer NOT NULL,
        PRIMARY KEY(owner,kind,id)
      );
      CREATE INDEX IF NOT EXISTS sync_pull ON sync_records(owner,revision);
      CREATE TABLE IF NOT EXISTS sync_mutations (
        owner text NOT NULL REFERENCES sync_owners(owner) ON DELETE CASCADE,
        id text NOT NULL, hash text NOT NULL, revision bigint NOT NULL,
        created timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner,id)
      );
    `);
  }
  encrypt(value, aad) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }
  decrypt(row) {
    const bytes = row.payload,
      decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAAD(
      Buffer.from(JSON.stringify([row.owner, row.kind, row.id, Number(row.revision)])),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    return {
      kind: row.kind,
      id: row.id,
      revision: Number(row.revision),
      deleted: row.deleted,
      schema: 1,
      value: JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(),
      ),
    };
  }
  validate(m) {
    if (
      !m ||
      !KINDS.includes(m.kind) ||
      typeof m.id !== 'string' ||
      !/^[\w:.-]{1,250}$/.test(m.id) ||
      !/^[\w-]{16,100}$/.test(m.mutationId) ||
      !Number.isSafeInteger(m.baseRevision) ||
      m.baseRevision < 0 ||
      m.schema !== 1 ||
      typeof m.deleted !== 'boolean' ||
      (m.deleted ? m.value !== null : m.value === undefined)
    )
      throw new SyncError(400, 'invalid_mutation');
    const limit = m.kind === 'clipboardImages' ? 8 * 1024 * 1024 : 1024 * 1024;
    if (Buffer.byteLength(JSON.stringify(m.value)) > limit)
      throw new SyncError(413, 'record_too_large');
  }
  async push(owner, mutation) {
    this.validate(mutation);
    const m = mutation,
      hash = createHash('sha256').update(JSON.stringify(m)).digest('hex');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('INSERT INTO sync_owners(owner) VALUES($1) ON CONFLICT DO NOTHING', [owner]);
      const state = (await db.query('SELECT * FROM sync_owners WHERE owner=$1 FOR UPDATE', [owner]))
        .rows[0];
      const prior = (
        await db.query('SELECT hash,revision FROM sync_mutations WHERE owner=$1 AND id=$2', [
          owner,
          m.mutationId,
        ])
      ).rows[0];
      if (prior) {
        if (prior.hash !== hash) throw new SyncError(409, 'mutation_id_reused');
        await db.query('COMMIT');
        return {
          ok: true,
          revision: Number(prior.revision),
          used: Number(state.used),
          quota: this.quota,
        };
      }
      const current = (
        await db.query('SELECT * FROM sync_records WHERE owner=$1 AND kind=$2 AND id=$3', [
          owner,
          m.kind,
          m.id,
        ])
      ).rows[0];
      if (Number(current?.revision ?? 0) !== m.baseRevision) {
        await db.query('ROLLBACK');
        return { ok: false, conflict: current ? this.decrypt(current) : null };
      }
      const counts = (
        await db.query(
          'SELECT (SELECT count(*) FROM sync_records WHERE owner=$1) AS records,(SELECT count(*) FROM sync_mutations WHERE owner=$1) AS mutations',
          [owner],
        )
      ).rows[0];
      if ((!current && Number(counts.records) >= 10000) || Number(counts.mutations) >= 100000)
        throw new SyncError(429, 'record_limit');
      const revision = Number(state.sequence) + 1;
      const payload = this.encrypt(m.value, JSON.stringify([owner, m.kind, m.id, revision]));
      const size = payload.length + 512,
        used = Number(state.used) - Number(current?.size ?? 0) + size;
      if (used > this.quota) throw new SyncError(413, 'quota_exceeded');
      await db.query(
        `INSERT INTO sync_records(owner,kind,id,revision,deleted,payload,size) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(owner,kind,id) DO UPDATE SET revision=$4,deleted=$5,payload=$6,size=$7`,
        [owner, m.kind, m.id, revision, m.deleted, payload, size],
      );
      await db.query('UPDATE sync_owners SET sequence=$2,used=$3 WHERE owner=$1', [
        owner,
        revision,
        used,
      ]);
      await db.query('INSERT INTO sync_mutations(owner,id,hash,revision) VALUES($1,$2,$3,$4)', [
        owner,
        m.mutationId,
        hash,
        revision,
      ]);
      await db.query(
        "DELETE FROM sync_mutations WHERE owner=$1 AND created < now() - interval '30 days'",
        [owner],
      );
      await db.query('COMMIT');
      return { ok: true, revision, used, quota: this.quota };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async pull(owner, cursor) {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new SyncError(400, 'invalid_cursor');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const state = (
        await db.query('SELECT sequence,used FROM sync_owners WHERE owner=$1', [owner])
      ).rows[0] ?? { sequence: 0, used: 0 };
      if (cursor > Number(state.sequence)) throw new SyncError(409, 'cursor_reset_required');
      const rows = (
        await db.query(
          'SELECT * FROM sync_records WHERE owner=$1 AND revision>$2 ORDER BY revision LIMIT 50',
          [owner, cursor],
        )
      ).rows;
      const records = [];
      let size = 0;
      for (const row of rows) {
        if (records.length && size + row.size > 10 * 1024 * 1024) break;
        records.push(this.decrypt(row));
        size += row.size;
      }
      const next = records.at(-1)?.revision ?? Number(state.sequence);
      await db.query('COMMIT');
      return {
        records,
        cursor: next,
        more: next < Number(state.sequence),
        used: Number(state.used),
        quota: this.quota,
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
}
