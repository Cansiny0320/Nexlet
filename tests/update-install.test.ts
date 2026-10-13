import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdates } from '../src/main/updater';

const adapter = vi.hoisted(() => ({
  version: '0.2.10', name: 'Nexlet', isPackaged: true,
  appUpdateConfigPath: '', userDataPath: '', baseCachePath: '',
  whenReady: async () => {}, relaunch: vi.fn(), quit: vi.fn(), onQuit: vi.fn()
}));
vi.mock('electron-updater', async importOriginal => {
  const actual = await importOriginal<typeof import('electron-updater')>();
  return { MacUpdater: actual.MacUpdater, AppImageUpdater: actual.AppImageUpdater, NsisUpdater: class extends actual.NsisUpdater {
    constructor() { super(null, adapter); }
  } };
});
import { createUpdateTransport } from '../src/main/update-transport';

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it.each([false, true])('launches the physical installer path, including elevation=%s', async elevated => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-install-path-'));
  const physical = path.join(directory, 'physical cache');
  const logical = path.join(directory, 'logical cache');
  try {
    await mkdir(physical);
    await symlink(physical, logical, 'junction');
    await writeFile(path.join(physical, 'Setup.exe'), 'test fixture, never executed');
    const updater = createUpdateTransport() as any;
    updater.logger = null;
    updater.downloadedUpdateHelper = { file: path.join(logical, 'Setup.exe'), packageFile: null, downloadedFileInfo: { isAdminRightsRequired: elevated } };
    const launch = vi.spyOn(updater, 'spawnLog').mockResolvedValue(true);
    vi.stubGlobal('process', Object.assign(Object.create(process), { resourcesPath: path.join(directory, 'resources') }));
    try {
      expect(updater.install(false, true)).toBe(true);
      const installer = realpathSync.native(path.join(physical, 'Setup.exe'));
      if (elevated) {
        expect(launch).toHaveBeenCalledExactlyOnceWith(path.join(process.resourcesPath, 'elevate.exe'), [installer, '--updated', '--force-run']);
      } else {
        expect(launch).toHaveBeenCalledExactlyOnceWith(installer, ['--updated', '--force-run']);
      }
    } finally { vi.unstubAllGlobals(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('reports a missing cached installer without launching or quitting the app', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-missing-installer-'));
  try {
    const updater = createUpdateTransport() as any;
    updater.logger = null;
    updater.downloadedUpdateHelper = { file: path.join(directory, 'missing.exe'), downloadedFileInfo: {} };
    const launch = vi.spyOn(updater, 'spawnLog').mockResolvedValue(true);
    const updates = new AppUpdates('0.2.10', 'automatic', updater, () => {}, async () => {});
    Object.assign((updates as any).status, { phase: 'downloaded', version: '0.2.16' });
    await updates.install();
    expect(updates.read()).toMatchObject({ phase: 'error', error: expect.stringContaining('ENOENT') });
    expect(launch).not.toHaveBeenCalled();
    expect(adapter.quit).not.toHaveBeenCalled();
    expect(updater.quitAndInstallCalled).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
