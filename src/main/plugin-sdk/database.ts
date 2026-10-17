import { t } from '../../shared/i18n';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export interface PluginDocument { id: string; rev: string; value: unknown; }
export interface DocumentWrite { id: string; rev?: string; value: unknown; }
type Row = { id: string; rev: string; value: string };
const key = (value: string) => { if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\0')) throw new Error(t("文档键无效")); return value; };
export class PluginDatabase {
  constructor(private sql: DatabaseSync) {
    sql.exec(`CREATE TABLE IF NOT EXISTS plugin_docs (plugin TEXT NOT NULL, id TEXT NOT NULL, rev TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(plugin,id));
      CREATE TABLE IF NOT EXISTS plugin_attachments (plugin TEXT NOT NULL, doc TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(plugin,doc,name));`);
  }
  get(plugin: string, id: string): PluginDocument | null {
    const row = this.sql.prepare('SELECT id,rev,value FROM plugin_docs WHERE plugin=? AND id=?').get(plugin, key(id)) as Row | undefined;
    return row ? { ...row, value: JSON.parse(row.value) } : null;
  }
  put(plugin: string, document: DocumentWrite): PluginDocument { return this.bulk(plugin, [document])[0]; }
  bulk(plugin: string, documents: DocumentWrite[]): PluginDocument[] {
    if (!Array.isArray(documents) || documents.length > 500) throw new Error(t("批量文档超过限制"));
    return this.transaction(() => {
      const result = documents.map(doc => {
        const id = key(doc.id), previous = this.get(plugin, id);
        if (previous ? doc.rev !== previous.rev : doc.rev !== undefined) throw new Error('document conflict');
        const value = JSON.stringify(doc.value);
        if (value === undefined || Buffer.byteLength(value) > 1024 * 1024) throw new Error(t("文档超过 1 MB 或不是 JSON"));
        const rev = randomUUID();
        this.sql.prepare('INSERT INTO plugin_docs VALUES(?,?,?,?) ON CONFLICT(plugin,id) DO UPDATE SET rev=excluded.rev,value=excluded.value').run(plugin, id, rev, value);
        return { id, rev, value: JSON.parse(value) };
      });
      this.quota(plugin); return result;
    });
  }
  query(plugin: string, options: { prefix?: string; after?: string; limit?: number } = {}): PluginDocument[] {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error(t("查询 limit 无效"));
    const prefix = options.prefix ?? '';
    if (typeof prefix !== 'string' || typeof (options.after ?? '') !== 'string') throw new Error(t("查询参数无效"));
    const rows = this.sql.prepare('SELECT id,rev,value FROM plugin_docs WHERE plugin=? AND substr(id,1,length(?))=? AND id>? ORDER BY id LIMIT ?').all(plugin, prefix, prefix, options.after ?? '', limit) as Row[];
    return rows.map(row => ({ ...row, value: JSON.parse(row.value) }));
  }
  remove(plugin: string, id: string, rev: string): boolean {
    return this.transaction(() => {
      this.requireRevision(plugin, id, rev);
      this.sql.prepare('DELETE FROM plugin_attachments WHERE plugin=? AND doc=?').run(plugin, id);
      this.sql.prepare('DELETE FROM plugin_docs WHERE plugin=? AND id=?').run(plugin, id); return true;
    });
  }
  putAttachment(plugin: string, id: string, rev: string, name: string, mime: string, data: Uint8Array): PluginDocument {
    key(name);
    if (!(data instanceof Uint8Array) || data.byteLength > 10 * 1024 * 1024 || typeof mime !== 'string' || mime.length > 200) throw new Error(t("附件无效或超过 10 MB"));
    return this.transaction(() => {
      const doc = this.requireRevision(plugin, id, rev), next = randomUUID();
      this.sql.prepare('INSERT INTO plugin_attachments VALUES(?,?,?,?,?) ON CONFLICT(plugin,doc,name) DO UPDATE SET mime=excluded.mime,data=excluded.data').run(plugin, id, name, mime, data);
      this.sql.prepare('UPDATE plugin_docs SET rev=? WHERE plugin=? AND id=?').run(next, plugin, id);
      this.quota(plugin); return { ...doc, rev: next };
    });
  }
  getAttachment(plugin: string, id: string, name: string): { mime: string; data: Uint8Array } | null {
    return this.sql.prepare('SELECT mime,data FROM plugin_attachments WHERE plugin=? AND doc=? AND name=?').get(plugin, key(id), key(name)) as { mime: string; data: Uint8Array } | undefined ?? null;
  }
  removeAttachment(plugin: string, id: string, rev: string, name: string): PluginDocument {
    return this.transaction(() => {
      const doc = this.requireRevision(plugin, id, rev), next = randomUUID();
      this.sql.prepare('DELETE FROM plugin_attachments WHERE plugin=? AND doc=? AND name=?').run(plugin, id, key(name));
      this.sql.prepare('UPDATE plugin_docs SET rev=? WHERE plugin=? AND id=?').run(next, plugin, id);
      return { ...doc, rev: next };
    });
  }
  clear(plugin: string): void {
    this.transaction(() => {
      this.sql.prepare('DELETE FROM plugin_attachments WHERE plugin=?').run(plugin);
      this.sql.prepare('DELETE FROM plugin_docs WHERE plugin=?').run(plugin);
    });
  }
  private requireRevision(plugin: string, id: string, rev: string): PluginDocument {
    const doc = this.get(plugin, id); if (!doc || doc.rev !== rev) throw new Error('document conflict'); return doc;
  }
  private quota(plugin: string): void {
    const row = this.sql.prepare('SELECT (SELECT coalesce(sum(length(CAST(value AS BLOB))),0) FROM plugin_docs WHERE plugin=?) + (SELECT coalesce(sum(length(data)),0) FROM plugin_attachments WHERE plugin=?) AS size').get(plugin, plugin) as { size: number };
    if (row.size > 50 * 1024 * 1024) throw new Error(t("插件数据库超过 50 MB"));
  }
  private transaction<T>(work: () => T): T {
    this.sql.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.sql.exec('COMMIT'); return result; }
    catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
}
