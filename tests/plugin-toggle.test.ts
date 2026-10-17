import { describe, expect, it, vi } from 'vitest';
import type { PluginRecord } from '../src/shared/types';
import type { Store } from '../src/main/store';
import type { LaunchInputs } from '../src/main/launch-input';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, safeStorage: {}, net: {} }));
vi.mock('../src/main/plugin-runtime', () => ({ PluginRuntime: class { stop = vi.fn(async () => {}); } }));
vi.mock('../src/main/plugin-sdk', () => ({ PluginSdk: class { configureUi = vi.fn(); stop = vi.fn(); } }));
import { PluginManager } from '../src/main/plugins';

function fixture() {
  const record = (id: string): PluginRecord => ({ manifest: { id, name: id, description: '', version: '1.0.0', apiVersion: 1, main: 'index.html', permissions: [], features: [] }, directory: id, enabled: true, development: true, installedAt: 1, source: 'local' });
  let records = [record('org.a'), record('org.b')];
  const store = { directory: '.', get: () => structuredClone(records), set: (_key: string, value: PluginRecord[]) => { records = structuredClone(value); } };
  const manager = new PluginManager(store as unknown as Store, () => {}, {} as LaunchInputs);
  let finish!: () => void;
  vi.mocked(manager.runtime.stop).mockImplementation(async id => { if (id === 'org.a') await new Promise<void>(resolve => { finish = resolve; }); });
  return { manager, store, records: () => records, finish: () => finish() };
}

describe('plugin toggle persistence', () => {
  it('preserves another plugin disabled while a running plugin finishes stopping', async () => {
    const f = fixture(), pending = f.manager.toggle('org.a', false);
    await f.manager.toggle('org.b', false);
    f.finish(); await pending;
    expect(f.records().map(record => record.enabled)).toEqual([false, false]);
  });
  it('does not resurrect a concurrently uninstalled plugin', async () => {
    const f = fixture(), pending = f.manager.toggle('org.a', false);
    await f.manager.remove('org.b', false);
    f.finish(); await pending;
    expect(f.records().map(record => record.manifest.id)).toEqual(['org.a']);
  });
  it('preserves replacement metadata and does not recreate a removed target', async () => {
    const f = fixture(), pending = f.manager.toggle('org.a', false);
    f.store.set('plugins', f.records().map(record => ({ ...record, installedAt: 2, manifest: { ...record.manifest, version: '2.0.0' } })));
    f.finish(); await pending;
    expect(f.records().every(record => record.installedAt === 2 && record.manifest.version === '2.0.0')).toBe(true);
    const next = f.manager.toggle('org.a', false);
    f.store.set('plugins', f.records().filter(record => record.manifest.id !== 'org.a'));
    f.finish(); await next;
    expect(f.records().map(record => record.manifest.id)).toEqual(['org.b']);
  });
});
