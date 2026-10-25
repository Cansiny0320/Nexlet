import { t } from '../shared/i18n';
import { randomUUID } from 'node:crypto';
import type {
  SyncCategory,
  SyncEntity,
  SyncMutation,
  SyncRecord,
  SyncState,
} from '../shared/account-sync';

export interface SyncAdapter {
  snapshot(categories: SyncCategory[]): SyncEntity[];
  apply(record: SyncRecord): void;
  transaction(write: () => void): void;
}
interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
export const emptySync = (): SyncState => ({
  enabled: [],
  cursor: 0,
  used: 0,
  quota: 100 * 1024 * 1024,
  entries: {},
  outbox: {},
  conflicts: {},
});
export const syncKey = (entity: Pick<SyncEntity, 'kind' | 'id'>) => entity.kind + ':' + entity.id;
const encoded = (value: unknown, deleted = false) =>
  JSON.stringify({ deleted, value: deleted ? null : value });
export class SyncEngine {
  constructor(
    private store: Storage,
    private owner: string,
    private adapter: SyncAdapter,
  ) {}
  read(): SyncState {
    return this.store.get('account-sync:' + this.owner, emptySync());
  }
  private write(state: SyncState) {
    this.store.set('account-sync:' + this.owner, state);
  }
  categories(enabled: SyncCategory[]) {
    const state = this.read();
    state.enabled = [...new Set(enabled)];
    state.cursor = 0;
    for (const [key, m] of Object.entries(state.outbox))
      if (!enabled.includes(m.kind)) delete state.outbox[key];
    for (const [key, c] of Object.entries(state.conflicts))
      if (!enabled.includes(c.local.kind)) delete state.conflicts[key];
    this.write(state);
    this.capture();
  }
  capture() {
    const state = this.read(),
      snapshot = this.adapter.snapshot(state.enabled),
      seen = new Set<string>();
    for (const entity of snapshot) {
      const key = syncKey(entity);
      seen.add(key);
      const value = encoded(entity.value),
        old = state.entries[key];
      if (old?.seen === value) continue;
      const m: SyncMutation = {
        ...entity,
        baseRevision: old?.revision ?? 0,
        mutationId: randomUUID(),
        schema: 1,
        deleted: false,
      };
      state.entries[key] = { seen: value, revision: old?.revision ?? 0 };
      if (state.conflicts[key]) state.conflicts[key].local = m;
      else state.outbox[key] = m;
    }
    for (const [key, old] of Object.entries(state.entries)) {
      const colon = key.indexOf(':'),
        kind = key.slice(0, colon) as SyncCategory,
        id = key.slice(colon + 1);
      if (!state.enabled.includes(kind) || seen.has(key) || old.seen === encoded(null, true))
        continue;
      const m: SyncMutation = {
        kind,
        id,
        value: null,
        baseRevision: old.revision,
        mutationId: randomUUID(),
        schema: 1,
        deleted: true,
      };
      old.seen = encoded(null, true);
      if (state.conflicts[key]) state.conflicts[key].local = m;
      else state.outbox[key] = m;
    }
    this.write(state);
  }
  pull(result: { records: SyncRecord[]; cursor: number; used: number; quota: number }) {
    this.adapter.transaction(() => {
      this.capture();
      const state = this.read(),
        applied: SyncRecord[] = [];
      for (const remote of result.records) {
        if (!state.enabled.includes(remote.kind)) continue;
        if (remote.schema !== 1) throw new Error(t('同步数据版本不受支持'));
        const key = syncKey(remote),
          old = state.entries[key];
        if (old && old.revision >= remote.revision) continue;
        const pending = state.conflicts[key]?.local ?? state.outbox[key];
        const same =
          pending &&
          encoded(pending.value, pending.deleted) === encoded(remote.value, remote.deleted);
        if (pending && !same) state.conflicts[key] = { key, local: pending, remote };
        else {
          this.adapter.apply(remote);
          applied.push(remote);
          state.entries[key] = {
            seen: encoded(remote.value, remote.deleted),
            revision: remote.revision,
          };
          delete state.conflicts[key];
        }
        delete state.outbox[key];
      }
      const actual = new Map(
        this.adapter.snapshot(state.enabled).map((e) => [syncKey(e), encoded(e.value)]),
      );
      for (const remote of applied)
        state.entries[syncKey(remote)].seen = actual.get(syncKey(remote)) ?? encoded(null, true);
      state.cursor = result.cursor;
      state.used = result.used;
      state.quota = result.quota;
      this.write(state);
    });
  }
  accepted(mutation: SyncMutation, result: { revision: number; used: number; quota: number }) {
    const state = this.read(),
      key = syncKey(mutation),
      pending = state.outbox[key];
    if (pending?.mutationId === mutation.mutationId) delete state.outbox[key];
    else if (pending) pending.baseRevision = result.revision;
    if (state.entries[key]) state.entries[key].revision = result.revision;
    state.used = result.used;
    state.quota = result.quota;
    this.write(state);
  }
  conflict(mutation: SyncMutation, remote: SyncRecord) {
    const state = this.read(),
      key = syncKey(mutation);
    state.conflicts[key] = { key, local: state.outbox[key] ?? mutation, remote };
    delete state.outbox[key];
    this.write(state);
  }
  resolve(key: string, choice: 'local' | 'remote') {
    this.adapter.transaction(() => {
      this.capture();
      const state = this.read(),
        conflict = state.conflicts[key];
      if (!conflict) throw new Error(t('同步冲突已变化，请刷新'));
      if (choice === 'remote') {
        this.adapter.apply(conflict.remote);
        const actual = this.adapter.snapshot(state.enabled).find((e) => syncKey(e) === key);
        state.entries[key] = {
          seen: actual ? encoded(actual.value) : encoded(null, true),
          revision: conflict.remote.revision,
        };
      } else {
        state.outbox[key] = {
          ...conflict.local,
          baseRevision: conflict.remote.revision,
          mutationId: randomUUID(),
        };
        state.entries[key].revision = conflict.remote.revision;
      }
      delete state.conflicts[key];
      this.write(state);
    });
  }
  resetCursor() {
    const state = this.read();
    state.cursor = 0;
    this.write(state);
  }
  clear() {
    this.write(emptySync());
  }
}
