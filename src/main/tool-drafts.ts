import { t } from '../shared/i18n';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

interface DraftStorage {
  directory?: string;
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  settings(): { restoreToolSessions: boolean };
}
/** A main-window draft can survive restart only after explicit opt-in. */
export class ToolDrafts {
  private values = new Map<string, Record<string, unknown>>();
  private resources = new Map<string, Uint8Array>();
  private resourceKeys = new Set<string>();
  private resourceQueue: Promise<void> = Promise.resolve();
  private saved = '';
  constructor(private store: DraftStorage) {
    if (store.settings().restoreToolSessions) {
      for (const [key, value] of Object.entries(store.get('tool-drafts', {})))
        this.values.set(key, value as Record<string, unknown>);
      this.resourceKeys = new Set(store.get<string[]>('tool-draft-resource-keys', []));
    }
  }
  read(key: string) {
    return structuredClone(this.values.get(key) ?? null);
  }
  save(key: string, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(t('工具状态无效'));
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > 4_000_000) throw Error(t('工具状态超过 4 MB'));
    this.values.delete(key);
    this.values.set(key, JSON.parse(json));
    // Bound the in-memory cache, including plugin drafts, without an idle timer.
    while (this.values.size > 40) this.values.delete(this.values.keys().next().value!);
    this.persist();
  }
  persist() {
    const value = this.store.settings().restoreToolSessions
      ? Object.fromEntries([...this.values].filter(([key]) => key.startsWith('main:')))
      : {};
    const json = JSON.stringify(value);
    if (json !== this.saved) {
      this.store.set('tool-drafts', value);
      this.saved = json;
    }
  }
  clear() {
    this.values.clear();
    this.resources.clear();
    this.resourceKeys.clear();
    this.store.set('tool-drafts', {});
    this.saved = '{}';
    return this.persistResources();
  }
  async readResource(key: string): Promise<Uint8Array | null> {
    const memory = this.resources.get(key);
    if (memory) return new Uint8Array(memory);
    if (!this.store.directory || !this.store.settings().restoreToolSessions) return null;
    if (!this.resourceKeys.has(key)) return null;
    const size = await stat(this.resourcePath(key)).then(
      (info) => info.size,
      () => 0,
    );
    if (!size || size > 20 * 1024 * 1024) return null;
    const bytes = await readFile(this.resourcePath(key)).catch(() => null);
    return bytes && bytes.length <= 20 * 1024 * 1024 ? new Uint8Array(bytes) : null;
  }
  async saveResource(key: string, bytes: unknown) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 20 * 1024 * 1024)
      throw Error(t('图片超过 20 MB'));
    this.resources.delete(key);
    this.resources.set(key, new Uint8Array(bytes));
    this.resourceKeys.delete(key);
    this.resourceKeys.add(key);
    let size = [...this.resources.values()].reduce((sum, value) => sum + value.byteLength, 0);
    while (size > 64 * 1024 * 1024) {
      const first = this.resources.keys().next().value!;
      size -= this.resources.get(first)!.byteLength;
      this.resources.delete(first);
      this.resourceKeys.delete(first);
    }
    await this.persistResources();
  }
  private resourcePath(key: string) {
    return path.join(
      this.store.directory!,
      'tool-draft-resources',
      createHash('sha256').update(key).digest('hex') + '.bin',
    );
  }
  persistResources() {
    const resources = this.store.settings().restoreToolSessions
      ? new Map([...this.resources].filter(([key]) => key.startsWith('main:')))
      : new Map<string, Uint8Array>();
    const keys = this.store.settings().restoreToolSessions
      ? [...this.resourceKeys].filter((key) => key.startsWith('main:'))
      : [];
    this.resourceQueue = this.resourceQueue
      .catch(() => {})
      .then(async () => {
        if (!this.store.directory) return;
        const previous = this.store.get<string[]>('tool-draft-resource-keys', []);
        const sizes = await Promise.all(
          keys.map(
            async (key) =>
              resources.get(key)?.byteLength ??
              (await stat(this.resourcePath(key)).then(
                (info) => info.size,
                () => 0,
              )),
          ),
        );
        let total = sizes.reduce((sum, size) => sum + size, 0);
        while (total > 64 * 1024 * 1024 && keys.length) {
          const key = keys.shift()!;
          total -= sizes.shift()!;
          resources.delete(key);
          this.resources.delete(key);
          this.resourceKeys.delete(key);
        }
        if (resources.size) await mkdir(path.dirname(this.resourcePath('')), { recursive: true });
        for (const [key, value] of resources)
          await writeFile(this.resourcePath(key), value, { mode: 0o600 });
        this.store.set('tool-draft-resource-keys', keys);
        for (const key of previous)
          if (!keys.includes(key)) await rm(this.resourcePath(key), { force: true });
      });
    return this.resourceQueue;
  }
}
