import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runCommand } = vi.hoisted(() => ({ runCommand: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => runCommand }));
import { loadMacCatalogIcons, loadMacCatalogNames } from '../src/main/catalog-mac';

beforeEach(() => runCommand.mockReset());
describe('macOS 本地化应用名称', () => {
  it('批量读取中文名称、去除扩展名且不把路径插入脚本', async () => {
    const file = '/Applications/应用 "quoted".app';
    runCommand.mockResolvedValue({ stdout: JSON.stringify([[file, ' 本地名称.app '], ['/missing.app', '']]) });
    expect(await loadMacCatalogNames([file, file, '/missing.app'])).toEqual(new Map([[file, '本地名称']]));
    const args = runCommand.mock.calls[0][1];
    expect(JSON.parse(args.at(-1))).toEqual([file, '/missing.app']);
    expect(args[3]).not.toContain(file);
  });
  it('某批失败不影响后续名称读取，空输入不启动进程', async () => {
    expect(await loadMacCatalogNames([])).toEqual(new Map());
    expect(runCommand).not.toHaveBeenCalled();
    runCommand.mockRejectedValueOnce(Error('timeout')).mockResolvedValueOnce({ stdout: '[["/128.app","终端"]]' });
    expect(await loadMacCatalogNames(Array.from({ length: 129 }, (_, i) => `/${i}.app`))).toEqual(new Map([['/128.app', '终端']]));
  });
});
describe('macOS 应用图标桥接', () => {
  it('路径作为 JSON 参数传入，并忽略单个应用的空图标', async () => {
    const file = '/Applications/应用 "quoted".app';
    runCommand.mockResolvedValue({ stdout: JSON.stringify([[file, 'data:image/png;base64,a'], ['/missing.app', '']]) });
    expect(await loadMacCatalogIcons([file, file, '/missing.app'])).toEqual(new Map([[file, 'data:image/png;base64,a']]));
    const [command, args] = runCommand.mock.calls[0];
    expect(command).toBe('/usr/bin/osascript');
    expect(JSON.parse(args.at(-1))).toEqual([file, '/missing.app']);
    expect(args[3]).not.toContain(file);
  });
  it('分批读取，某批失败仍可继续读取其余应用', async () => {
    runCommand.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ stdout: JSON.stringify([['/64.app', 'icon']]) });
    expect(await loadMacCatalogIcons(Array.from({ length: 65 }, (_, i) => `/${i}.app`))).toEqual(new Map([['/64.app', 'icon']]));
    expect(runCommand).toHaveBeenCalledTimes(2);
  });
  it('没有待加载图标时不启动系统进程', async () => {
    expect(await loadMacCatalogIcons([])).toEqual(new Map());
    expect(runCommand).not.toHaveBeenCalled();
  });
});
