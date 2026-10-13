import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readdir: vi.fn(), stat: vi.fn(), names: vi.fn() }));
// This suite simulates macOS, including its path semantics on Windows runners.
vi.mock('node:path', async importOriginal => {
  const actual = await importOriginal<typeof import('node:path')>();
  return { ...actual, default: actual.posix };
});
vi.mock('node:fs/promises', () => ({ readdir: mocks.readdir, stat: mocks.stat }));
vi.mock('electron', () => ({ app: { getPath: () => '/Desktop' }, shell: {} }));
vi.mock('../src/main/catalog-icons', () => ({ loadCatalogIcon: vi.fn() }));
vi.mock('../src/main/catalog-mac', () => ({ loadMacCatalogIcons: vi.fn(), loadMacCatalogNames: mocks.names }));
import { Catalog } from '../src/main/catalog';
import { searchCommands } from '../src/shared/search';

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  const entries: Record<string, string[]> = {
    '/System/Applications': ['System Settings.app', 'Utilities'],
    '/System/Applications/Utilities': ['Terminal.app', 'Audio MIDI Setup.app'],
    '/System/Library/CoreServices/Applications': ['Folder Actions Setup.app', 'Keychain Access.app']
  };
  mocks.readdir.mockImplementation(async (directory: string) => (entries[directory] || []).map(name => ({ name, isDirectory: () => true, isSymbolicLink: () => false })));
  mocks.stat.mockImplementation(async (file: string) => { if (file.endsWith('/Finder.app')) return { isDirectory: () => true }; throw Error('not found'); });
  mocks.names.mockResolvedValue(new Map([
    ['/System/Applications/System Settings.app', '系统设置'],
    ['/System/Applications/Utilities/Terminal.app', '终端'],
    ['/System/Applications/Utilities/Audio MIDI Setup.app', '音频MIDI设置'],
    ['/System/Library/CoreServices/Applications/Folder Actions Setup.app', '文件夹操作设置'],
    ['/System/Library/CoreServices/Applications/Keychain Access.app', '钥匙串访问'],
    ['/System/Library/CoreServices/Finder.app', '访达']
  ]));
});
afterEach(() => vi.restoreAllMocks());

describe('macOS 系统应用索引', () => {
  it('中文、英文、拼音均可命中，路径 ID 与本地化无关', async () => {
    const catalog = new Catalog(() => {}); await catalog.scan();
    const file = path.join('/System/Applications', 'System Settings.app');
    const id = 'app:' + createHash('sha256').update(file).digest('hex').slice(0, 20);
    expect(catalog.items.find(c => c.id === id)).toMatchObject({ name: '系统设置', keywords: ['System Settings'], path: file });
    for (const query of ['系统设置', '设置', 'System Settings', 'systemsettings', 'xtsz', 'xitongshezhi']) {
      expect(searchCommands(catalog.items, query).some(c => c.id === id), query).toBe(true);
    }
    expect(catalog.resolveIds([id])).toEqual([id]);
    for (const query of ['终端', 'Terminal', 'MIDI', '文件夹操作', '钥匙串', '访达', 'Finder']) {
      expect(searchCommands(catalog.items, query).length, query).toBeGreaterThan(0);
    }
    expect(mocks.readdir).not.toHaveBeenCalledWith('/System/Library/CoreServices', expect.anything());
  });
  it('元数据不可用保留可启动的英文条目，重新扫描不重复添加别名', async () => {
    const catalog = new Catalog(() => {}); await catalog.scan(); await catalog.scan();
    expect(catalog.items.find(c => c.name === '终端')?.keywords).toEqual(['Terminal']);
    mocks.names.mockResolvedValue(new Map()); await catalog.scan();
    expect(catalog.items.find(c => c.name === 'Terminal')?.path).toBe('/System/Applications/Utilities/Terminal.app');
    expect(catalog.loading).toBe(false);
  });
});
