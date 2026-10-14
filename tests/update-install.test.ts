import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppUpdates } from '../src/main/updater';

const adapter = vi.hoisted(() => ({
  version: '0.2.10', name: 'Nexlet', isPackaged: true,
  appUpdateConfigPath: '', userDataPath: '', baseCachePath: '',
  whenReady: async () => {}, relaunch: vi.fn(), quit: vi.fn(), onQuit: vi.fn()
}));
const electron = vi.hoisted(() => ({ autoUpdater: { emit: vi.fn() }, shell: { openPath: vi.fn(async () => 'Location is not available') } }));
vi.mock('electron', () => electron);
vi.mock('electron-updater', async importOriginal => {
  const actual = await importOriginal<typeof import('electron-updater')>();
  return { MacUpdater: actual.MacUpdater, AppImageUpdater: actual.AppImageUpdater, NsisUpdater: class extends actual.NsisUpdater {
    constructor() { super(null, adapter); }
  } };
});
import { createUpdateTransport } from '../src/main/update-transport';

// electron-updater uses require(), so intercept its Electron boundary too.
// No real process or Windows Shell call is allowed in these tests.
const require = createRequire(import.meta.url);
require('electron');
const electronModule = require.cache[require.resolve('electron')]!;
const originalElectron = electronModule.exports;
beforeEach(() => { electronModule.exports = electron; });
afterEach(() => { electronModule.exports = originalElectron; vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

async function downloadedFixture() {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-install-start-'));
  const installer = path.join(directory, 'Setup.exe');
  await writeFile(installer, 'test fixture, never executed');
  const resources = path.join(directory, 'resources');
  await mkdir(resources);
  await writeFile(path.join(resources, 'elevate.exe'), 'test fixture, never executed');
  vi.stubGlobal('process', Object.assign(Object.create(process), { resourcesPath: resources }));
  const updater = createUpdateTransport() as any;
  updater.logger = null;
  updater.downloadedUpdateHelper = { file: installer, downloadedFileInfo: { isAdminRightsRequired: false } };
  const updates = new AppUpdates('0.2.21', 'automatic', updater, () => {}, async () => {});
  Object.assign((updates as any).status, { phase: 'downloaded', version: '0.2.22' });
  return { directory, installer, updater, updates };
}

it('waits for installer spawn confirmation before quitting', async () => {
  const fixture = await downloadedFixture();
  const child = Object.assign(new EventEmitter(), { pid: 123, unref: vi.fn() });
  vi.spyOn(childProcess, 'spawn').mockReturnValue(child as any);
  try {
    const pending = fixture.updates.install();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(adapter.quit).not.toHaveBeenCalled();
    expect(electron.autoUpdater.emit).not.toHaveBeenCalled();
    await fixture.updater.quitAndInstall(true, true);
    expect(childProcess.spawn).toHaveBeenCalledOnce();
    expect(childProcess.spawn).toHaveBeenCalledWith(realpathSync.native(fixture.installer), ['--updated', '/S', '--force-run'], {
      cwd: realpathSync.native(tmpdir()), detached: true, stdio: 'ignore', windowsHide: true
    });
    child.emit('spawn');
    await pending;
    expect(child.unref).toHaveBeenCalledOnce();
    expect(electron.autoUpdater.emit).toHaveBeenCalledExactlyOnceWith('before-quit-for-update');
    expect(adapter.quit).toHaveBeenCalledOnce();
  } finally { child.emit('spawn'); await new Promise(resolve => setImmediate(resolve)); await rm(fixture.directory, { recursive: true, force: true }); }
});

it('keeps the app open and never opens Windows Shell when installer spawn fails with ENOENT', async () => {
  const fixture = await downloadedFixture();
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
    queueMicrotask(() => child.emit('error', Object.assign(Error('installer path unavailable'), { code: 'ENOENT' })));
    return child as any;
  });
  try {
    await fixture.updates.install();
    await new Promise(resolve => setImmediate(resolve));
    expect(electron.shell.openPath).not.toHaveBeenCalled();
    expect(adapter.quit).not.toHaveBeenCalled();
    expect(fixture.updates.read()).toMatchObject({ phase: 'error', error: expect.stringContaining('installer path unavailable') });
    expect(fixture.updater.quitAndInstallCalled).toBe(false);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

it.each([
  { required: true, code: 'EACCES', exit: 0 },
  { required: true, code: 'EACCES', exit: 1 },
  { required: false, code: 'EACCES', exit: 0 },
  { required: false, code: 'UNKNOWN', exit: 1 }
])('waits for elevation handoff: $required, $code, exit $exit', async ({ required, code, exit }) => {
  const fixture = await downloadedFixture();
  fixture.updater.downloadedUpdateHelper.downloadedFileInfo.isAdminRightsRequired = required;
  const helper = Object.assign(new EventEmitter(), { pid: 124, unref: vi.fn() });
  const launch = vi.spyOn(childProcess, 'spawn').mockImplementation(command => {
    if (String(command).endsWith('elevate.exe')) {
      queueMicrotask(() => helper.emit('spawn'));
      return helper as any;
    }
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    queueMicrotask(() => child.emit('error', Object.assign(Error('elevation required'), { code })));
    return child as any;
  });
  try {
    const pending = fixture.updates.install();
    await new Promise(resolve => setImmediate(resolve));
    expect(adapter.quit).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(required ? 1 : 2);
    expect(launch).toHaveBeenLastCalledWith(realpathSync.native(path.join(process.resourcesPath, 'elevate.exe')),
      [realpathSync.native(fixture.installer), '--updated', '/S', '--force-run'], expect.objectContaining({ windowsHide: true }));
    helper.emit('exit', exit, null);
    await pending;
    expect(electron.shell.openPath).not.toHaveBeenCalled();
    if (exit === 0) expect(adapter.quit).toHaveBeenCalledOnce();
    else {
      expect(adapter.quit).not.toHaveBeenCalled();
      expect(fixture.updates.read()).toMatchObject({ phase: 'error', error: expect.stringContaining('提权失败或已取消') });
      expect(fixture.updater.quitAndInstallCalled).toBe(false);
    }
  } finally { helper.emit('exit', 1, null); await rm(fixture.directory, { recursive: true, force: true }); }
});

it.each([false, true])('launches the physical installer silently with automatic restart, including elevation=%s', async elevated => {
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
      expect(updater.install(true, true)).toBe(true);
      const installer = realpathSync.native(path.join(physical, 'Setup.exe'));
      if (elevated) {
        expect(launch).toHaveBeenCalledExactlyOnceWith(path.join(process.resourcesPath, 'elevate.exe'), [installer, '--updated', '/S', '--force-run']);
      } else {
        expect(launch).toHaveBeenCalledExactlyOnceWith(installer, ['--updated', '/S', '--force-run']);
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
