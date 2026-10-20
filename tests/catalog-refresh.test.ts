import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  watch: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  names: vi.fn(),
  icons: vi.fn(),
  notify: vi.fn(),
  windowsApps: vi.fn(),
  windowsSignature: vi.fn(),
}));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  watch: mocks.watch,
}));
vi.mock('node:fs/promises', () => ({ readdir: mocks.readdir, stat: mocks.stat }));
vi.mock('node:path', async (original) => ({
  ...(await original<typeof import('node:path')>()),
  default: (await original<typeof import('node:path')>()).posix,
}));
vi.mock('electron', () => ({ app: { getPath: () => '/Desktop' }, shell: {} }));
vi.mock('../src/main/catalog-icons', () => ({ loadCatalogIcon: vi.fn() }));
vi.mock('../src/main/catalog-mac', () => ({
  loadMacCatalogIcons: mocks.icons,
  loadMacCatalogNames: mocks.names,
}));
vi.mock('../src/main/catalog-windows', () => ({
  readWindowsApplications: mocks.windowsApps,
  readWindowsApplicationSignature: mocks.windowsSignature,
}));
import { Catalog } from '../src/main/catalog';

let catalog: Catalog;
let files: Record<string, string[]>;
let watchers: Map<string, EventEmitter & { close: ReturnType<typeof vi.fn> }>;
const paths = () => catalog.items.map((item) => item.path);
const changed = (directory = '/Applications') =>
  watchers.get(directory)!.emit('change', 'rename', null);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  files = { '/Applications': [] };
  watchers = new Map();
  mocks.readdir.mockImplementation(async (directory: string) =>
    (files[directory] || []).map((name) => ({
      name,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    })),
  );
  mocks.stat.mockImplementation(async (file: string) =>
    file.endsWith('.app')
      ? null
      : {
          isDirectory: () => true,
          dev: 1,
          ino: file,
          mtimeMs: JSON.stringify(files[file] || []),
          ctimeMs: 0,
        },
  );
  mocks.names.mockResolvedValue(new Map());
  mocks.icons.mockImplementation(
    async (paths: string[]) =>
      new Map(paths.map((file) => [file, 'data:image/png;base64,fixture'])),
  );
  mocks.windowsApps.mockResolvedValue([]);
  mocks.windowsSignature.mockResolvedValue('[]');
  mocks.watch.mockImplementation((directory, _options, listener) => {
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
    watcher.on('change', listener);
    watchers.set(directory, watcher);
    return watcher;
  });
  catalog = new Catalog(mocks.notify);
});
afterEach(() => {
  catalog.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('does not poll in the background even when the filesystem changes', async () => {
  catalog.startAutoRefresh();
  await catalog.scan();
  mocks.stat.mockClear();
  mocks.readdir.mockClear();
  mocks.names.mockClear();
  mocks.notify.mockClear();
  files['/Applications'] = ['Pulse.app'];
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(mocks.stat).not.toHaveBeenCalled();
  expect(mocks.readdir).not.toHaveBeenCalled();
  expect(mocks.names).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await catalog.checkForChanges();
  expect(paths()).toContain('/Applications/Pulse.app');
});

it('does not rescan, notify the UI or discard cached icons when a wake check finds no changes', async () => {
  files['/Applications'] = ['Pulse.app'];
  catalog.startAutoRefresh();
  await catalog.scan();
  const before = catalog.items;
  const icons = await catalog.withIcons(before);
  mocks.readdir.mockClear();
  mocks.names.mockClear();
  mocks.icons.mockClear();
  mocks.notify.mockClear();
  await catalog.checkForChanges();
  await catalog.checkForChanges();
  expect(mocks.readdir).not.toHaveBeenCalled();
  expect(mocks.names).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(catalog.items).toBe(before);
  expect(await catalog.withIcons(catalog.items)).toEqual(icons);
  expect(mocks.icons).toHaveBeenCalledWith([]);
});

it('keeps the pre-scan snapshot so a missed change during scanning is recovered on wake', async () => {
  catalog.startAutoRefresh();
  mocks.names.mockImplementationOnce(async () => {
    files['/Applications'] = ['Pulse.app'];
    return new Map();
  });
  await catalog.scan();
  expect(paths()).not.toContain('/Applications/Pulse.app');
  await catalog.checkForChanges();
  expect(paths()).toContain('/Applications/Pulse.app');
});

it('detects creation and deletion of a previously missing root without filesystem events', async () => {
  const readStat = mocks.stat.getMockImplementation()!;
  mocks.stat.mockImplementation((file: string) =>
    file === '/Later' && !files[file] ? Promise.reject(Error('ENOENT')) : readStat(file),
  );
  catalog.startAutoRefresh();
  await catalog.scan(['/Later']);
  files['/Later'] = ['Pulse.app'];
  await catalog.checkForChanges();
  expect(paths()).toContain('/Later/Pulse.app');
  delete files['/Later'];
  await catalog.checkForChanges();
  expect(paths()).not.toContain('/Later/Pulse.app');
});

it('detects Windows registered app changes without rebuilding unchanged catalogs', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  catalog.startAutoRefresh();
  await catalog.scan();
  mocks.readdir.mockClear();
  mocks.windowsApps.mockClear();
  mocks.notify.mockClear();
  await catalog.checkForChanges();
  expect(mocks.readdir).not.toHaveBeenCalled();
  expect(mocks.windowsApps).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
  mocks.windowsSignature.mockResolvedValue('installed');
  mocks.windowsApps.mockResolvedValue([{ Name: 'Store fixture', AppID: 'Package!App' }]);
  await catalog.checkForChanges();
  expect(catalog.items.some((item) => item.id === 'uwp:Package!App')).toBe(true);
  mocks.windowsSignature.mockResolvedValue('[]');
  mocks.windowsApps.mockResolvedValue([]);
  await catalog.checkForChanges();
  expect(catalog.items.some((item) => item.id === 'uwp:Package!App')).toBe(false);
});

it('automatically adds and removes apps, coalescing events without requiring a filename', async () => {
  catalog.startAutoRefresh();
  await catalog.scan();
  mocks.names.mockClear();
  files['/Applications'] = ['Pulse.app'];
  changed();
  changed();
  changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(paths()).toContain('/Applications/Pulse.app');
  expect(mocks.names).toHaveBeenCalledTimes(1);
  expect(watchers.has('/Applications/Pulse.app')).toBe(false);
  files['/Applications'] = [];
  changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(paths()).not.toContain('/Applications/Pulse.app');
});

it('watches new nested folders and removes watches when custom search paths change', async () => {
  catalog.startAutoRefresh();
  await catalog.scan(['/Custom']);
  files['/Custom'] = ['Tools'];
  files['/Custom/Tools'] = ['Pulse.app'];
  changed('/Custom');
  await vi.advanceTimersByTimeAsync(1000);
  expect(paths()).toContain('/Custom/Tools/Pulse.app');
  const nested = watchers.get('/Custom/Tools')!;
  await catalog.scan([]);
  expect(nested.close).toHaveBeenCalled();
  expect(paths()).not.toContain('/Custom/Tools/Pulse.app');
});

it('does not drop a change that arrives while a scan is in flight', async () => {
  catalog.startAutoRefresh();
  await catalog.scan();
  let finish!: (names: Map<string, string>) => void;
  mocks.names.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const scanning = catalog.scan();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  files['/Applications'] = ['Pulse.app'];
  changed();
  await vi.advanceTimersByTimeAsync(1000);
  finish(new Map());
  await scanning;
  expect(paths()).toContain('/Applications/Pulse.app');
});

it('uses the latest search paths when settings change during a scan', async () => {
  let finish!: (names: Map<string, string>) => void;
  mocks.names.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const scanning = catalog.scan(['/Old']);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  files['/New'] = ['Pulse.app'];
  const next = catalog.scan(['/New']);
  finish(new Map());
  await Promise.all([scanning, next]);
  expect(paths()).toContain('/New/Pulse.app');
});

it('recovers from unavailable watches and missed events on wake', async () => {
  mocks.watch.mockImplementationOnce(() => {
    throw Error('ENOENT');
  });
  catalog.startAutoRefresh();
  await catalog.scan();
  files['/Applications'] = ['Pulse.app'];
  await catalog.checkForChanges();
  expect(paths()).toContain('/Applications/Pulse.app');
  expect(watchers.has('/Applications')).toBe(true);
  watchers.get('/Applications')!.emit('error', Error('watch unavailable'));
  files['/Applications'] = [];
  await vi.advanceTimersByTimeAsync(1000);
  expect(paths()).not.toContain('/Applications/Pulse.app');
});

it('closes watchers and cancels pending refreshes on shutdown', async () => {
  catalog.startAutoRefresh();
  await catalog.scan();
  const active = [...watchers.values()];
  mocks.names.mockClear();
  changed();
  catalog.close();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(mocks.names).not.toHaveBeenCalled();
  expect(active.every((watcher) => watcher.close.mock.calls.length > 0)).toBe(true);
});

it('reuses unchanged watches and replaces a watch when its directory inode changes', async () => {
  catalog.startAutoRefresh();
  await catalog.scan();
  const first = watchers.get('/Applications')!;
  mocks.watch.mockClear();
  await catalog.scan();
  expect(mocks.watch).not.toHaveBeenCalled();
  expect(first.close).not.toHaveBeenCalled();
  mocks.stat.mockImplementation(async (file: string) =>
    file.endsWith('.app')
      ? null
      : { isDirectory: () => true, dev: 1, ino: file === '/Applications' ? 'replaced' : file },
  );
  files['/Applications'] = ['Pulse.app'];
  await catalog.checkForChanges();
  expect(first.close).toHaveBeenCalledOnce();
  expect(watchers.get('/Applications')).not.toBe(first);
  files['/Applications'] = [];
  changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(paths()).not.toContain('/Applications/Pulse.app');
});

it('does not recreate watches when an in-flight scan completes after shutdown', async () => {
  catalog.startAutoRefresh();
  await catalog.scan();
  let finish!: (names: Map<string, string>) => void;
  mocks.names.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const scanning = catalog.scan();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  catalog.close();
  mocks.watch.mockClear();
  finish(new Map());
  await scanning;
  expect(mocks.watch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
