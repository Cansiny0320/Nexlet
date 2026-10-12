import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readdir: vi.fn(), readShortcutLink: vi.fn(), apps: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readdir: mocks.readdir }));
vi.mock('electron', () => ({ app: { getPath: () => 'C:/Desktop' }, shell: { readShortcutLink: mocks.readShortcutLink } }));
vi.mock('../src/main/catalog-icons', () => ({ loadCatalogIcon: vi.fn() }));
vi.mock('../src/main/catalog-mac', () => ({ loadMacCatalogIcons: vi.fn() }));
vi.mock('../src/main/catalog-windows', () => ({ readWindowsApplications: mocks.apps }));
import { Catalog } from '../src/main/catalog';

const menu = path.join('C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs');
const desktop = 'C:/Desktop';
const publicDesktop = path.join('C:/Public', 'Desktop');
const idFor = (file: string) => 'app:' + createHash('sha256').update(file.toLowerCase()).digest('hex').slice(0, 20);
let files: Map<string, string[]>;
let links: Map<string, { target: string; args?: string; cwd?: string }>;
function shortcut(directory: string, name: string, target: string, args = '', cwd = '') {
  files.set(directory, [...(files.get(directory) || []), name]);
  const file = path.join(directory, name);
  links.set(file, { target, args, cwd });
  return file;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.stubEnv('APPDATA', 'C:/UserData');
  vi.stubEnv('PROGRAMDATA', 'C:/ProgramData');
  vi.stubEnv('PUBLIC', 'C:/Public');
  files = new Map(); links = new Map();
  mocks.readdir.mockImplementation(async directory => (files.get(directory) || []).map(name => ({ name, isDirectory: () => false, isSymbolicLink: () => false })));
  mocks.readShortcutLink.mockImplementation(file => {
    const link = links.get(file);
    if (!link) throw new Error('Unreadable shortcut');
    return link;
  });
  mocks.apps.mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Windows catalog shortcut deduplication', () => {
  it('merges menu and desktop copies by normalized target, keeping the original launch link and name aliases', async () => {
    const kept = shortcut(menu, 'QQ.lnk', 'C:\\Apps\\QQ\\QQ.exe');
    shortcut(desktop, 'QQ desktop.lnk', 'c:/apps/qq/./QQ.exe');
    shortcut(publicDesktop, 'QQ.lnk', 'C:/APPS/QQ/QQ.EXE');
    const catalog = new Catalog(() => {});
    await catalog.scan();
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0]).toMatchObject({ id: idFor(kept), path: kept, name: 'QQ', keywords: ['QQ desktop'] });
  });

  it('preserves distinct targets, argument values and working directories', async () => {
    shortcut(menu, 'QQ.lnk', 'C:/Apps/QQ/QQ.exe');
    shortcut(desktop, 'QQ.lnk', 'D:/Apps/QQ/QQ.exe');
    shortcut(menu, 'Profile A.lnk', 'C:/Apps/QQ/QQ.exe', '--profile=A');
    shortcut(menu, 'Lowercase profile.lnk', 'C:/Apps/QQ/QQ.exe', '--profile=a');
    shortcut(menu, 'Working directory.lnk', 'C:/Apps/QQ/QQ.exe', '', 'C:/Work');
    const catalog = new Catalog(() => {});
    await catalog.scan();
    expect(catalog.items).toHaveLength(5);
  });

  it('normalizes working directory paths without changing argument semantics', async () => {
    shortcut(menu, 'Editor.lnk', 'C:/Apps/editor.exe', '--profile=A', 'C:/Work');
    shortcut(desktop, 'Editor.lnk', 'C:/Apps/editor.exe', '--profile=A', 'c:\\work\\.');
    const catalog = new Catalog(() => {});
    await catalog.scan();
    expect(catalog.items).toHaveLength(1);
  });

  it('keeps unreadable or empty-target links and URL shortcuts without interrupting the scan', async () => {
    files.set(menu, ['Broken.lnk', 'Empty.lnk', 'Site.url']);
    files.set(desktop, ['Broken.lnk', 'Empty.lnk', 'Site.url']);
    links.set(path.join(menu, 'Empty.lnk'), { target: '' });
    links.set(path.join(desktop, 'Empty.lnk'), { target: '' });
    const catalog = new Catalog(() => {});
    await catalog.scan();
    expect(catalog.items).toHaveLength(6);
    expect(catalog.loading).toBe(false);
    expect(mocks.readShortcutLink.mock.calls.every(([file]) => file.endsWith('.lnk'))).toBe(true);
  });

  it('maps saved pins and recent IDs to the retained entry, preserving order and unrelated commands', async () => {
    const kept = shortcut(menu, 'QQ.lnk', 'C:/Apps/QQ.exe');
    const duplicate = shortcut(desktop, 'QQ.lnk', 'C:/Apps/QQ.exe');
    const catalog = new Catalog(() => {});
    await catalog.scan();
    expect(catalog.resolveIds([idFor(duplicate), 'tool:clipboard', idFor(kept)]))
      .toEqual([idFor(kept), 'tool:clipboard']);
  });

  it('rebuilds deduplication and ID mappings on each scan', async () => {
    const kept = shortcut(menu, 'QQ.lnk', 'C:/Apps/QQ.exe');
    const duplicate = shortcut(desktop, 'QQ.lnk', 'C:/Apps/QQ.exe');
    const catalog = new Catalog(() => {});
    await catalog.scan();
    expect(catalog.items).toHaveLength(1);
    files.delete(menu);
    await catalog.scan();
    expect(catalog.items.map(item => item.path)).toEqual([duplicate]);
    expect(catalog.resolveIds([idFor(duplicate), idFor(kept)])).toEqual([idFor(duplicate), idFor(kept)]);
  });
});
