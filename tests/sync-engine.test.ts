import { describe, it, expect } from 'vite-plus/test';
import { SyncEngine, type SyncAdapter } from '../src/main/sync-engine';
import type { SyncEntity, SyncRecord } from '../src/shared/account-sync';
function fixture() {
  const data = new Map<string, unknown>(),
    entities = new Map<string, SyncEntity>();
  const adapter: SyncAdapter = {
    snapshot: (categories) => [...entities.values()].filter((e) => categories.includes(e.kind)),
    apply: (r) => {
      if (r.deleted) entities.delete(r.id);
      else entities.set(r.id, { kind: r.kind, id: r.id, value: r.value });
    },
    transaction: (write) => write(),
  };
  const store = {
    get: <T>(k: string, f: T) => structuredClone(data.get(k) ?? f) as T,
    set: (k: string, v: unknown) => {
      data.set(k, structuredClone(v));
    },
  };
  return { entities, store, adapter, engine: new SyncEngine(store, 'alice', adapter) };
}
const remote = (revision: number, value: unknown, deleted = false): SyncRecord => ({
  kind: 'snippets',
  id: 'one',
  revision,
  schema: 1,
  value,
  deleted,
});
describe('account synchronization', () => {
  it('converges two isolated clients after offline edits, explicit conflict resolution and deletion', () => {
    const a = fixture(),
      b = fixture();
    a.entities.set('one', { kind: 'snippets', id: 'one', value: 'original' });
    a.engine.categories(['snippets']);
    a.engine.accepted(Object.values(a.engine.read().outbox)[0], {
      revision: 1,
      used: 1,
      quota: 100,
    });
    b.engine.categories(['snippets']);
    b.engine.pull({ records: [remote(1, 'original')], cursor: 1, used: 1, quota: 100 });
    b.entities.set('one', { kind: 'snippets', id: 'one', value: 'offline edit' });
    b.engine.capture();
    a.entities.set('one', { kind: 'snippets', id: 'one', value: 'online edit' });
    a.engine.capture();
    a.engine.accepted(Object.values(a.engine.read().outbox)[0], {
      revision: 2,
      used: 1,
      quota: 100,
    });
    const resumed = new SyncEngine(b.store, 'alice', b.adapter);
    resumed.pull({ records: [remote(2, 'online edit')], cursor: 2, used: 1, quota: 100 });
    expect(resumed.read().conflicts['snippets:one'].local.value).toBe('offline edit');
    resumed.resolve('snippets:one', 'local');
    resumed.accepted(Object.values(resumed.read().outbox)[0], { revision: 3, used: 1, quota: 100 });
    a.engine.pull({ records: [remote(3, 'offline edit')], cursor: 3, used: 1, quota: 100 });
    expect(a.entities.get('one')).toEqual(b.entities.get('one'));
    b.entities.delete('one');
    resumed.capture();
    resumed.accepted(Object.values(resumed.read().outbox)[0], { revision: 4, used: 0, quota: 100 });
    a.engine.pull({ records: [remote(4, null, true)], cursor: 4, used: 0, quota: 100 });
    a.engine.capture();
    expect(a.entities.size).toBe(0);
    expect(a.engine.read().outbox).toEqual({});
  });
  it('keeps an offline outbox over restart, versions retries and isolates another account', () => {
    const f = fixture();
    f.entities.set('one', { kind: 'snippets', id: 'one', value: 'local' });
    f.engine.categories(['snippets']);
    const m = Object.values(f.engine.read().outbox)[0];
    const resumed = new SyncEngine(f.store, 'alice', f.adapter);
    expect(Object.values(resumed.read().outbox)[0].mutationId).toBe(m.mutationId);
    resumed.accepted(m, { revision: 2, used: 100, quota: 1000 });
    expect(resumed.read().outbox).toEqual({});
    const other = new SyncEngine(f.store, 'bob', f.adapter);
    other.capture();
    expect(other.read().outbox).toEqual({});
    expect(other.read().enabled).toEqual([]);
  });
  it('preserves concurrent edits and tombstones until the user chooses', () => {
    const f = fixture();
    f.entities.set('one', { kind: 'snippets', id: 'one', value: 'local' });
    f.engine.categories(['snippets']);
    f.engine.pull({ records: [remote(1, 'remote')], cursor: 1, used: 1, quota: 100 });
    expect(f.entities.get('one')?.value).toBe('local');
    expect(Object.keys(f.engine.read().conflicts)).toHaveLength(1);
    f.engine.resolve('snippets:one', 'local');
    const m = Object.values(f.engine.read().outbox)[0];
    expect(m.baseRevision).toBe(1);
    f.engine.accepted(m, { revision: 2, used: 1, quota: 100 });
    f.engine.pull({ records: [remote(3, null, true)], cursor: 3, used: 1, quota: 100 });
    f.engine.capture();
    expect(f.entities.has('one')).toBe(false);
    expect(f.engine.read().outbox).toEqual({});
  });
  it('detects edits made while a pull was in flight and emits deletes', () => {
    const f = fixture();
    f.engine.categories(['snippets']);
    f.engine.pull({ records: [remote(1, 'old')], cursor: 1, used: 1, quota: 100 });
    f.entities.set('one', { kind: 'snippets', id: 'one', value: 'changed during request' });
    f.engine.pull({ records: [remote(2, 'remote')], cursor: 2, used: 1, quota: 100 });
    expect(f.engine.read().conflicts['snippets:one'].local.value).toBe('changed during request');
    f.engine.resolve('snippets:one', 'remote');
    f.entities.delete('one');
    f.engine.capture();
    expect(Object.values(f.engine.read().outbox)[0]).toMatchObject({
      deleted: true,
      baseRevision: 2,
    });
  });
});
