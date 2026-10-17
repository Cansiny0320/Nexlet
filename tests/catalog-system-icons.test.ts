import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import type { Command } from '../src/shared/types';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/main/system-icons-mac', () => ({ loadMacSystemIcons: mocks.load }));
vi.mock('electron', () => ({ app: {}, shell: {} }));
import { Catalog } from '../src/main/catalog';

const display: Command = {
  id: 'system:settings:display',
  name: '显示器设置',
  kind: 'system',
  subtitle: '',
  keywords: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
});
afterEach(() => vi.restoreAllMocks());

it('系统设置在搜索、最近和固定共用的图标链路中加载，并合并并发请求', async () => {
  mocks.load.mockResolvedValue(new Map([[display.id, 'data:image/png;base64,native']]));
  const catalog = new Catalog(() => {});
  const [first, second] = await Promise.all([
    catalog.withIcons([display]),
    catalog.withIcons([display]),
  ]);
  expect(first[0].icon).toBe('data:image/png;base64,native');
  expect(second[0].icon).toBe(first[0].icon);
  await catalog.withIcons([display]);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(display.icon).toBeUndefined();
});

it('读取失败保留兜底，普通工具和系统动作不触发原生读取', async () => {
  const catalog = new Catalog(() => {});
  const tool = { ...display, id: 'tool:settings', kind: 'tool' as const };
  const action = { ...display, id: 'system:action:sleep' };
  expect(await catalog.withIcons([tool, action])).toEqual([tool, action]);
  expect(mocks.load).not.toHaveBeenCalled();
  mocks.load.mockResolvedValue(new Map());
  expect(await catalog.withIcons([display])).toEqual([display]);
});

it('Windows 不调用 macOS 原生图标读取', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  expect(await new Catalog(() => {}).withIcons([display])).toEqual([display]);
  expect(mocks.load).not.toHaveBeenCalled();
});
