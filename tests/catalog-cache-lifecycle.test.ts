import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  readdir: vi.fn(),
  readShortcutLink: vi.fn(),
  apps: vi.fn(),
  icon: vi.fn(),
  fingerprint: vi.fn(),
}));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  readdir: mocks.readdir,
}));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/Desktop' },
  shell: { readShortcutLink: mocks.readShortcutLink },
}));
vi.mock('../src/main/catalog-icons', () => ({
  loadCatalogIcon: mocks.icon,
  windowsIconFingerprint: mocks.fingerprint,
}));
vi.mock('../src/main/catalog-windows', () => ({ readWindowsApplications: mocks.apps }));
import { CatalogCache } from '../src/main/catalog-cache';
import { Catalog } from '../src/main/catalog';

const menu = path.join('C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs');
const desktop = 'C:/Desktop';
const png = (text: string) => 'data:image/png;base64,' + Buffer.from(text).toString('base64');
const idFor = (file: string) =>
  'app:' + createHash('sha256').update(file.toLowerCase()).digest('hex').slice(0, 20);
let directory: string;
let files: Map<string, string[]>;
let versions: Map<string, number>;
const catalogs: Catalog[] = [];
function catalog() {
  const instance = new Catalog(() => {}, new CatalogCache(directory));
  catalogs.push(instance);
  return instance;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.stubEnv('APPDATA', 'C:/UserData');
  vi.stubEnv('PROGRAMDATA', 'C:/ProgramData');
  vi.stubEnv('PUBLIC', 'C:/Public');
  directory = mkdtempSync(path.join(tmpdir(), 'nexlet-catalog-lifecycle-'));
  files = new Map([[menu, ['Editor.lnk']]]);
  versions = new Map();
  mocks.readdir.mockImplementation(async (dir) =>
    (files.get(dir) || []).map((name) => ({
      name,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    })),
  );
  mocks.readShortcutLink.mockImplementation((file) => ({
    target:
      path.basename(file) === 'Editor desktop.lnk'
        ? 'C:/Apps/Editor.exe'
        : 'C:/Apps/' + path.basename(file).replace('.lnk', '.exe'),
    args: '',
    cwd: '',
  }));
  mocks.apps.mockResolvedValue([]);
  mocks.icon.mockResolvedValue(png('editor'));
  mocks.fingerprint.mockImplementation(async (file) =>
    createHash('sha256')
      .update(file + ':' + (versions.get(file) || 0))
      .digest('hex'),
  );
});
afterEach(() => {
  for (const instance of catalogs.splice(0)) instance.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'nexlet-catalog-lifecycle-')))
    throw Error('Unexpected fixture path');
  rmSync(directory, { recursive: true, force: true });
});

describe('Windows cached catalog lifecycle', () => {
  it('restores names, aliases and icons before touching scan sources on restart', async () => {
    files.set(desktop, ['Editor desktop.lnk']);
    const first = catalog();
    await first.scan();
    const decorated = await first.withIcons(first.items);
    first.close();
    mocks.readdir.mockClear();
    mocks.fingerprint.mockClear();
    mocks.icon.mockClear();
    const next = catalog();
    next.restore();
    expect(next.items.map((item) => item.name)).toEqual(['Editor']);
    expect(next.resolveIds([idFor(path.join(desktop, 'Editor desktop.lnk'))])).toEqual([
      next.items[0].id,
    ]);
    expect(await next.withIcons(next.items)).toEqual(decorated);
    expect(mocks.readdir).not.toHaveBeenCalled();
    expect(mocks.fingerprint).not.toHaveBeenCalled();
    expect(mocks.icon).not.toHaveBeenCalled();
    const incompatible = catalog();
    incompatible.restore(['C:/Other']);
    expect(incompatible.items).toEqual([]);
  });

  it('keeps cached entries visible during refresh, then updates additions and deletions', async () => {
    const instance = catalog();
    await instance.scan();
    await instance.withIcons(instance.items);
    const gate = deferred<[]>();
    mocks.apps.mockReturnValueOnce(gate.promise);
    files.set(menu, ['New app.lnk']);
    const refresh = instance.scan();
    expect(instance.loading).toBe(true);
    expect(instance.items[0].name).toBe('Editor');
    expect((await instance.withIcons(instance.items))[0].icon).toBe(png('editor'));
    gate.resolve([]);
    await refresh;
    expect(instance.items.map((item) => item.name)).toEqual(['New app']);
    instance.close();
    const restored = catalog();
    restored.restore();
    expect(restored.items.map((item) => item.name)).toEqual(['New app']);
  });

  it('preserves memory and disk snapshots on directory or Windows app enumeration failure', async () => {
    const instance = catalog();
    await instance.scan();
    const revision = instance.revision;
    files.set(menu, []);
    mocks.apps.mockRejectedValueOnce(Error('PowerShell unavailable'));
    await instance.scan();
    expect(instance.items[0].name).toBe('Editor');
    expect(instance.revision).toBe(revision);
    mocks.readdir.mockRejectedValueOnce(Object.assign(Error('Access denied'), { code: 'EACCES' }));
    await instance.scan();
    expect(instance.items[0].name).toBe('Editor');
    instance.close();
    const restored = catalog();
    restored.restore();
    expect(restored.items[0].name).toBe('Editor');
    await restored.scan();
    expect(restored.items).toEqual([]); // A successful empty enumeration is a real deletion.
  });

  it('reuses unchanged icons, retries missing icons and refreshes changed resource fingerprints', async () => {
    const instance = catalog();
    await instance.scan();
    await instance.withIcons(instance.items);
    await instance.scan();
    await instance.withIcons(instance.items);
    expect(mocks.icon).toHaveBeenCalledTimes(1);
    versions.set(path.join(menu, 'Editor.lnk'), 1);
    await instance.scan();
    mocks.icon.mockResolvedValueOnce('');
    expect((await instance.withIcons(instance.items))[0].icon).toBe('');
    mocks.icon.mockResolvedValueOnce(png('new'));
    expect((await instance.withIcons(instance.items))[0].icon).toBe(png('new'));
    expect(mocks.icon).toHaveBeenCalledTimes(3);
  });

  it('does not let a delayed icon response overwrite a newer scan or cache', async () => {
    const instance = catalog();
    await instance.scan();
    const gate = deferred<string>();
    mocks.icon.mockReturnValueOnce(gate.promise);
    const old = instance.withIcons(instance.items);
    await vi.waitFor(() => expect(mocks.icon).toHaveBeenCalledTimes(1));
    versions.set(path.join(menu, 'Editor.lnk'), 1);
    await instance.scan();
    mocks.icon.mockResolvedValueOnce(png('new'));
    expect((await instance.withIcons(instance.items))[0].icon).toBe(png('new'));
    gate.resolve(png('old'));
    expect((await old)[0].icon).toBeUndefined();
    instance.close();
    const restored = catalog();
    restored.restore();
    expect((await restored.withIcons(restored.items))[0].icon).toBe(png('new'));
  });

  it('queues a changed scan scope and never commits its superseded predecessor', async () => {
    const instance = catalog();
    await instance.scan();
    const revision = instance.revision;
    files.set('C:/Extra A', ['Only A.lnk']);
    files.set('C:/Extra B', ['Only B.lnk']);
    const gate = deferred<[]>();
    mocks.apps.mockReturnValueOnce(gate.promise);
    const first = instance.scan(['C:/Extra A']);
    await vi.waitFor(() => expect(mocks.apps).toHaveBeenCalledTimes(2));
    const second = instance.scan(['C:/Extra B']);
    gate.resolve([]);
    await Promise.all([first, second]);
    expect(instance.items.map((item) => item.name)).toEqual(['Editor', 'Only B']);
    expect(instance.revision).toBe(revision + 1);
    instance.close();
    const restored = catalog();
    restored.restore(['C:/Extra B']);
    expect(restored.items.map((item) => item.name)).toEqual(['Editor', 'Only B']);
  });

  it('preserves a previously successful empty snapshot when a later scan fails', async () => {
    files.clear();
    const instance = catalog();
    await instance.scan();
    instance.close();
    const restored = catalog();
    restored.restore();
    files.set(menu, ['Partial result.lnk']);
    mocks.apps.mockRejectedValueOnce(Error('enumeration failed'));
    const revision = restored.revision;
    await restored.scan();
    expect(restored.items).toEqual([]);
    expect(restored.revision).toBe(revision);
  });

  it('shares in-flight icon work and prevents persistence after shutdown', async () => {
    const instance = catalog();
    await instance.scan();
    const gate = deferred<string>();
    mocks.icon.mockReturnValueOnce(gate.promise);
    const first = instance.withIcons(instance.items),
      second = instance.withIcons(instance.items);
    await vi.waitFor(() => expect(mocks.icon).toHaveBeenCalledTimes(1));
    instance.close();
    gate.resolve(png('late'));
    expect((await first)[0].icon).toBeUndefined();
    expect((await second)[0].icon).toBeUndefined();
    const restored = catalog();
    restored.restore();
    mocks.icon.mockResolvedValueOnce(png('fresh'));
    expect((await restored.withIcons(restored.items))[0].icon).toBe(png('fresh'));
    expect(mocks.icon).toHaveBeenCalledTimes(2);
  });
});
