import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ getFileIcon: vi.fn(), readShortcutLink: vi.fn(), createFromPath: vi.fn() }));
vi.mock('electron', () => ({ app: { getFileIcon: mocks.getFileIcon }, shell: { readShortcutLink: mocks.readShortcutLink }, nativeImage: { createFromPath: mocks.createFromPath } }));
import { loadCatalogIcon, windowsIconFingerprint } from '../src/main/catalog-icons';

it('invalidates cached icons when a shortcut target or custom resource changes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-icon-fingerprint-'));
  try {
    const file = path.join(directory, 'App.lnk'), target = path.join(directory, 'app.exe'), icon = path.join(directory, 'app.ico');
    await Promise.all([writeFile(file, 'shortcut'), writeFile(target, 'target'), writeFile(icon, 'icon')]);
    const link = { target, icon, args: '', cwd: '', iconIndex: 0 };
    const first = await windowsIconFingerprint(file, link);
    expect(await windowsIconFingerprint(file, link)).toBe(first);
    await writeFile(target, 'new executable');
    const second = await windowsIconFingerprint(file, link);
    expect(second).not.toBe(first);
    await writeFile(icon, 'new icon resource');
    expect(await windowsIconFingerprint(file, link)).not.toBe(second);
    expect(await windowsIconFingerprint(file, { ...link, iconIndex: 1 })).not.toBe(await windowsIconFingerprint(file, link));
  } finally {
    if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'nexlet-icon-fingerprint-'))) throw Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true });
  }
});

const image = (value: string) => ({ isEmpty: () => !value, toDataURL: () => value });
beforeEach(() => { vi.resetAllMocks(); mocks.createFromPath.mockReturnValue(image('')); });
describe('应用与快捷方式图标', () => {
  it('普通快捷方式显示目标程序的图标，不显示通用 lnk 图标', async () => {
    mocks.readShortcutLink.mockReturnValue({ target: 'C:/Apps/editor.exe', icon: '' });
    mocks.getFileIcon.mockImplementation(async file => image(file.endsWith('.lnk') ? 'generic' : 'editor'));
    expect(await loadCatalogIcon('C:/Desktop/editor.lnk', 'win32')).toBe('editor');
  });
  it('快捷方式自定义图标优先，资源失效时回退到程序图标', async () => {
    mocks.readShortcutLink.mockReturnValue({ target: 'C:/Apps/editor.exe', icon: 'C:/Icons/editor.ico' });
    mocks.getFileIcon.mockResolvedValueOnce(image('editor'));
    expect(await loadCatalogIcon('C:/Desktop/editor.lnk', 'win32')).toBe('editor');
    expect(mocks.createFromPath).toHaveBeenCalledWith('C:/Icons/editor.ico');
    expect(mocks.getFileIcon.mock.calls.map(call => call[0])).toEqual(['C:/Apps/editor.exe']);
  });
  it('损坏的快捷方式保留搜索结果和通用图标', async () => {
    mocks.readShortcutLink.mockImplementation(() => { throw Error('broken'); });
    mocks.getFileIcon.mockResolvedValue(image('generic'));
    expect(await loadCatalogIcon('C:/Desktop/missing.lnk', 'win32')).toBe('generic');
  });
  it('快捷方式的 ICO 图标读取像素，不使用系统文件类型图标', async () => {
    mocks.readShortcutLink.mockReturnValue({ target: 'D:/Apps/Feishu.exe', icon: 'D:/Apps/icon.ico' });
    mocks.createFromPath.mockReturnValue(image('feishu-pixels'));
    mocks.getFileIcon.mockResolvedValue(image('generic-file'));
    expect(await loadCatalogIcon('C:/Desktop/飞书.lnk', 'win32')).toBe('feishu-pixels');
    expect(mocks.getFileIcon).not.toHaveBeenCalled();
  });
  it('注册应用的 PNG 资源直接读取像素', async () => {
    mocks.createFromPath.mockReturnValue(image('logo'));
    expect(await loadCatalogIcon('C:/Apps/Assets/logo.png', 'win32')).toBe('logo');
    expect(mocks.getFileIcon).not.toHaveBeenCalled();
  });
});
