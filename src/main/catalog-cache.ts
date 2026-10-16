import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Command } from '../shared/types';

export interface CatalogSnapshot {
  context: string;
  items: Command[];
  aliases: [string, string][];
  iconSources: [string, string][];
  fingerprints: [string, string][];
}
const VERSION = 1;
const DATABASE_VERSION = 2;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_ICON_BYTES = 512 * 1024;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !value.includes('\0');
const image = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_ICON_BYTES && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

function decode(value: string): CatalogSnapshot | undefined {
  if (Buffer.byteLength(value) > MAX_SNAPSHOT_BYTES) return;
  const data = JSON.parse(value);
  if (!data || data.version !== VERSION || !text(data.context, 256 * 1024) || !Array.isArray(data.items) || data.items.length > 6000) return;
  const items: Command[] = [];
  for (const item of data.items) {
    if (!item || !text(item.id, 512) || !/^(app:|uwp:)/.test(item.id) || !text(item.name, 4096)
      || !text(item.subtitle, 32767) || !['app', 'shortcut'].includes(item.kind)
      || (item.path !== undefined && (!text(item.path, 32767) || !path.win32.isAbsolute(item.path)))
      || !Array.isArray(item.keywords) || item.keywords.length > 256 || !item.keywords.every((word: unknown) => text(word, 4096))) return;
    items.push({ id: item.id, name: item.name, subtitle: item.subtitle, kind: item.kind, keywords: item.keywords, ...(item.path ? { path: item.path } : {}) });
  }
  const ids = new Set(items.map(item => item.id));
  if (ids.size !== items.length) return;
  for (const field of ['aliases', 'iconSources', 'fingerprints'] as const) {
    if (!Array.isArray(data[field]) || data[field].length > 10000) return;
    const seen = new Set<string>();
    for (const pair of data[field]) {
      if (!Array.isArray(pair) || pair.length !== 2 || !text(pair[0], 512) || !text(pair[1], 32767) || seen.has(pair[0])) return;
      if (field === 'aliases' ? !ids.has(pair[1]) || ids.has(pair[0]) : !ids.has(pair[0])) return;
      if (field === 'fingerprints' && !/^[a-f0-9]{64}$/.test(pair[1])) return;
      if (field === 'iconSources' && !path.win32.isAbsolute(pair[1])) return;
      seen.add(pair[0]);
    }
  }
  if (data.fingerprints.length !== items.length) return;
  return { context: data.context, items, aliases: data.aliases, iconSources: data.iconSources, fingerprints: data.fingerprints };
}

/** Disposable, bounded cache; no tables or files from the user Store are touched. */
export class CatalogCache {
  private db?: DatabaseSync;
  private clock = Date.now();
  constructor(directory: string, private budget = 32 * 1024 * 1024) {
    const file = path.join(directory, 'catalog-cache.sqlite');
    try {
      mkdirSync(directory, { recursive: true });
      try { this.open(file); } catch (error) {
        this.close();
        if (!/file is not a database|database disk image is malformed/i.test(String(error))) throw error;
        // Only these exact, owned cache files can be rebuilt after corruption.
        for (const suffix of ['', '-journal']) {
          try { unlinkSync(file + suffix); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        }
        this.open(file);
      }
    } catch (error) { this.disable(error); }
  }
  private open(file: string): void {
    const db = this.db = new DatabaseSync(file);
    db.exec('PRAGMA busy_timeout=100; PRAGMA auto_vacuum=FULL; PRAGMA journal_mode=DELETE; PRAGMA max_page_count=12288;');
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version !== VERSION && version.user_version !== DATABASE_VERSION) db.exec('DROP TABLE IF EXISTS snapshot; DROP TABLE IF EXISTS icons;');
    db.exec(`CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS icons (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL, used INTEGER NOT NULL);`);
    // v1 may contain generic Electron icons. Keep the catalog available at startup,
    // but discard these bitmaps before restore can serve them again.
    if (version.user_version === 1) db.exec('DELETE FROM icons');
    db.exec(`PRAGMA user_version=${DATABASE_VERSION};`);
    const last = db.prepare('SELECT MAX(used) AS used FROM icons').get() as { used: number | null };
    this.clock = Math.max(this.clock, last.used || 0);
  }
  private disable(error: unknown): void { console.warn('Application catalog cache unavailable:', String(error)); this.close(); }
  load(context: string): CatalogSnapshot | undefined {
    if (!this.db) return;
    try {
      const row = this.db.prepare('SELECT value FROM snapshot WHERE id=1').get() as { value: string } | undefined;
      if (!row) return;
      const snapshot = decode(row.value);
      return snapshot?.context === context ? snapshot : undefined;
    } catch { return; } // A malformed snapshot is disposable; the next successful scan replaces it.
  }
  save(snapshot: CatalogSnapshot): void {
    if (!this.db) return;
    try {
      const value = JSON.stringify({ version: VERSION, ...snapshot });
      if (!decode(value)) return;
      const fingerprints = new Map(snapshot.fingerprints);
      this.db.exec('BEGIN');
      this.db.prepare('INSERT INTO snapshot(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value);
      const icons = this.db.prepare('SELECT id,fingerprint FROM icons').all() as { id: string; fingerprint: string }[];
      const remove = this.db.prepare('DELETE FROM icons WHERE id=?');
      for (const row of icons) if (fingerprints.get(row.id) !== row.fingerprint) remove.run(row.id);
      this.db.exec('COMMIT');
    } catch (error) { this.rollback(); this.disable(error); }
  }
  getIcon(id: string, fingerprint: string): string | undefined {
    if (!this.db) return;
    try {
      const row = this.db.prepare('SELECT data FROM icons WHERE id=? AND fingerprint=?').get(id, fingerprint) as { data: string } | undefined;
      if (!row || !image(row.data)) return;
      this.db.prepare('UPDATE icons SET used=? WHERE id=?').run(++this.clock, id);
      return row.data;
    } catch (error) { this.disable(error); return; }
  }
  setIcon(id: string, fingerprint: string, data: string): void {
    if (!this.db || !image(data)) return;
    const bytes = Buffer.byteLength(data);
    if (bytes > this.budget) return;
    try {
      this.db.exec('BEGIN');
      this.db.prepare('DELETE FROM icons WHERE id=?').run(id);
      const rows = this.db.prepare('SELECT id,bytes FROM icons ORDER BY used DESC').all() as { id: string; bytes: number }[];
      let total = bytes;
      const remove = this.db.prepare('DELETE FROM icons WHERE id=?');
      for (const row of rows) { total += row.bytes; if (total > this.budget) remove.run(row.id); }
      this.db.prepare('INSERT INTO icons(id,fingerprint,data,bytes,used) VALUES(?,?,?,?,?)').run(id, fingerprint, data, bytes, ++this.clock);
      this.db.exec('COMMIT');
    } catch (error) { this.rollback(); this.disable(error); }
  }
  private rollback(): void { try { this.db?.exec('ROLLBACK'); } catch { /* A failed BEGIN may have no transaction. */ } }
  close(): void { const db = this.db; this.db = undefined; try { db?.close(); } catch { /* Cache shutdown must not block exit. */ } }
}
