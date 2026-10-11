import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getFileIcon: vi.fn(), readShortcutLink: vi.fn(), createFromPath: vi.fn() }));
vi.mock('electron', () => ({ app: { getFileIcon: mocks.getFileIcon }, shell: { readShortcutLink: mocks.readShortcutLink }, nativeImage: { createFromPath: mocks.createFromPath } }));
import { loadCatalogIcon } from '../src/main/catalog-icons';

const image = (value: string) => ({ isEmpty: () => !value, toDataURL: () => value });
beforeEach(() => { vi.resetAllMocks(); });
describe('应用与快捷方式图标', () => {
  it('普通快捷方式显示目标程序的图标，不显示通用 lnk 图标', async () => {
    mocks.readShortcutLink.mockReturnValue({ target: 'C:/Apps/editor.exe', icon: '' });
    mocks.getFileIcon.mockImplementation(async file => image(file.endsWith('.lnk') ? 'generic' : 'editor'));
    expect(await loadCatalogIcon('C:/Desktop/editor.lnk', 'win32')).toBe('editor');
  });
  it('快捷方式自定义图标优先，资源失效时回退到程序图标', async () => {
    mocks.readShortcutLink.mockReturnValue({ target: 'C:/Apps/editor.exe', icon: 'C:/Icons/editor.ico' });
    mocks.getFileIcon.mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce(image('editor'));
    expect(await loadCatalogIcon('C:/Desktop/editor.lnk', 'win32')).toBe('editor');
    expect(mocks.getFileIcon.mock.calls.map(call => call[0])).toEqual(['C:/Icons/editor.ico', 'C:/Apps/editor.exe']);
  });
  it('损坏的快捷方式保留搜索结果和通用图标', async () => {
    mocks.readShortcutLink.mockImplementation(() => { throw Error('broken'); });
    mocks.getFileIcon.mockResolvedValue(image('generic'));
    expect(await loadCatalogIcon('C:/Desktop/missing.lnk', 'win32')).toBe('generic');
  });
  it('注册应用的 PNG 资源直接读取像素', async () => {
    mocks.createFromPath.mockReturnValue(image('logo'));
    expect(await loadCatalogIcon('C:/Apps/Assets/logo.png', 'win32')).toBe('logo');
    expect(mocks.getFileIcon).not.toHaveBeenCalled();
  });
});
