import { formatLocale } from '../shared/i18n';
import { t } from '../shared/i18n';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS, type Settings, type ClipItem, type Scratchpad } from '../shared/types';

export class Store {
  readonly db: DatabaseSync;
  readonly images: string;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.images = path.join(directory, 'images'); mkdirSync(this.images, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'nexlet.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS clips (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, created INTEGER NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS clips_created ON clips(created DESC);');
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM documents WHERE key=?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : fallback;
  }
  set(key: string, value: unknown): void { this.db.prepare('INSERT INTO documents(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  settings(): Settings { return { ...DEFAULT_SETTINGS, ...this.get<Partial<Settings>>('settings', {}) }; }
  pads(): Scratchpad[] {
    const existing = this.get<Scratchpad[] | null>('pads', null);
    if (existing !== null) return existing;
    const first: Scratchpad = { id: randomUUID(), name: new Date().toLocaleString(formatLocale(), { hour12: false }), createdAt: Date.now(), updatedAt: Date.now(), locked: false, color: '#e9e6df', lines: [{ id: randomUUID(), expression: '', note: '' }] };
    this.set('pads', [first]); return [first];
  }
  addClip(item: ClipItem): ClipItem {
    const old = this.db.prepare('SELECT data FROM clips WHERE hash=?').get(item.hash) as { data: string } | undefined;
    if (old) { const previous = JSON.parse(old.data) as ClipItem; item = { ...previous, createdAt: item.createdAt }; }
    item = { ...item, createdAt: this.nextClipTime(item.createdAt) };
    this.db.prepare('INSERT INTO clips(id,hash,created,favorite,data) VALUES(?,?,?,?,?) ON CONFLICT(hash) DO UPDATE SET created=excluded.created,data=excluded.data').run(item.id, item.hash, item.createdAt, Number(item.favorite), JSON.stringify(item));
    return item;
  }
  clips(query = '', kind = 'all'): ClipItem[] {
    const rows = this.db.prepare('SELECT data FROM clips ORDER BY created DESC LIMIT 10000').all() as { data: string }[];
    const q = query.trim().toLowerCase();
    return rows.map(r => JSON.parse(r.data) as ClipItem).filter(i => (kind === 'all' || (kind === 'favorite' ? i.favorite : i.kind === kind)) && (!q || i.text.toLowerCase().includes(q)));
  }
  clip(id: string): ClipItem | undefined { const row = this.db.prepare('SELECT data FROM clips WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) : undefined; }
  private nextClipTime(time = Date.now()): number {
    const latest = this.db.prepare('SELECT MAX(created) AS created FROM clips').get() as { created: number | null };
    return Math.max(time, (latest.created ?? 0) + 1);
  }
  touchClips(ids: string[]): void {
    let time = this.nextClipTime();
    const update = this.db.prepare('UPDATE clips SET created=?,data=? WHERE id=?');
    // Reverse iteration keeps a merged selection in its original paste order.
    for (const id of [...new Set(ids)].reverse()) {
      const item = this.clip(id); if (!item) continue;
      item.createdAt = time++;
      update.run(item.createdAt, JSON.stringify(item), id);
    }
  }
  hasClipHash(hash: string): boolean { return !!this.db.prepare('SELECT 1 FROM clips WHERE hash=?').get(hash); }
  favorite(id: string, value: boolean): void {
    const item = this.clip(id); if (!item) throw new Error(t("记录已不存在"));
    item.favorite = value;
    this.db.prepare('UPDATE clips SET favorite=?,data=? WHERE id=?').run(Number(value), JSON.stringify(item), id);
  }
  deleteClips(ids: string[]): void {
    for (const id of ids) {
      const item = this.clip(id); if (!item) continue;
      this.db.prepare('DELETE FROM clips WHERE id=?').run(id);
      if (item.imagePath && path.dirname(path.resolve(item.imagePath)) === path.resolve(this.images)) {
        try { unlinkSync(item.imagePath); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(t("图片清理失败"), (e as Error).message); }
      }
    }
  }
  prune(now = Date.now()): void {
    const settings = this.settings();
    const items = this.clips().filter(i => !i.favorite);
    this.deleteClips(items.filter((item, index) => index >= settings.maxClipboardItems || item.createdAt < now - settings.retentionDays * 86400000).map(i => i.id));
  }
  close(): void { this.db.close(); }
}
