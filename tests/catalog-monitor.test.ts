import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ watch: vi.fn(), stat: vi.fn() }));
vi.mock('node:fs', () => ({ watch: mocks.watch }));
vi.mock('node:fs/promises', () => ({ stat: mocks.stat }));
import { CatalogMonitor } from '../src/main/catalog-monitor';

const directory = 'C:/Applications/Tools';
const snapshot = (ino: number) => ({ identity: `1:${ino}`, version: `1:${ino}:0:0` });
const info = (ino: number) => ({
  isDirectory: () => true,
  dev: 1,
  ino,
  mtimeMs: 0,
  ctimeMs: 0,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let monitor: CatalogMonitor;
let refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
let watchers: (EventEmitter & { close: ReturnType<typeof vi.fn> })[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  watchers = [];
  mocks.stat.mockResolvedValue(info(1));
  mocks.watch.mockImplementation((_directory, _options, listener) => {
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
    watcher.on('change', listener);
    watchers.push(watcher);
    return watcher;
  });
  refresh = vi.fn().mockResolvedValue(undefined);
  monitor = new CatalogMonitor(refresh);
  monitor.update(new Map([[directory, snapshot(1)]]));
});
afterEach(() => {
  monitor.close();
  vi.useRealTimers();
});

it('closes a deleted directory watch before a catalog refresh can finish', async () => {
  const scanning = deferred<void>();
  refresh.mockReturnValue(scanning.promise);
  const old = watchers[0];
  mocks.stat.mockRejectedValue(Object.assign(Error('missing'), { code: 'ENOENT' }));
  // Windows can keep reporting successful rename events on a deleted handle.
  for (let i = 0; i < 1000; i++) old.emit('change', 'rename', directory);
  await vi.advanceTimersByTimeAsync(0);
  expect(old.close).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
  expect(mocks.stat).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(750);
  expect(refresh).toHaveBeenCalledOnce();
  for (let i = 0; i < 1000; i++) old.emit('change', 'rename', directory);
  await vi.advanceTimersByTimeAsync(2000);
  expect(refresh).toHaveBeenCalledOnce();
  expect(mocks.stat).toHaveBeenCalledTimes(1);
  scanning.resolve();
});

it('rebinds a replaced directory before scanning and keeps watching the new directory', async () => {
  const old = watchers[0];
  mocks.stat.mockResolvedValue(info(2));
  old.emit('change', 'rename', null);
  await vi.advanceTimersByTimeAsync(0);
  expect(old.close).toHaveBeenCalledOnce();
  expect(watchers).toHaveLength(2);
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(750);
  expect(refresh).toHaveBeenCalledOnce();
  watchers[1].emit('change', 'change', 'New.lnk');
  await vi.advanceTimersByTimeAsync(750);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(watchers[1].close).not.toHaveBeenCalled();
});

it('coalesces validation during event bursts and preserves an unchanged watcher', async () => {
  const checking = deferred<ReturnType<typeof info>>();
  mocks.stat.mockReturnValue(checking.promise);
  for (let i = 0; i < 1000; i++) watchers[0].emit('change', 'rename', null);
  expect(mocks.stat).toHaveBeenCalledTimes(1);
  checking.resolve(info(1));
  await vi.advanceTimersByTimeAsync(750);
  expect(refresh).toHaveBeenCalledOnce();
  expect(watchers[0].close).not.toHaveBeenCalled();
  expect(watchers).toHaveLength(1);
});

it('ignores a stale validation after a watcher has been replaced', async () => {
  const checking = deferred<ReturnType<typeof info> | null>();
  mocks.stat.mockReturnValue(checking.promise);
  const old = watchers[0];
  old.emit('change', 'rename', null);
  monitor.update(new Map([[directory, snapshot(2)]]));
  checking.resolve(null);
  await vi.advanceTimersByTimeAsync(1000);
  expect(old.close).toHaveBeenCalledOnce();
  expect(watchers[1].close).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

it('does not restore a removed search path or refresh after shutdown during validation', async () => {
  const checking = deferred<ReturnType<typeof info>>();
  mocks.stat.mockReturnValue(checking.promise);
  watchers[0].emit('change', 'rename', null);
  monitor.update(new Map());
  monitor.close();
  checking.resolve(info(2));
  await vi.advanceTimersByTimeAsync(1000);
  expect(watchers).toHaveLength(1);
  expect(refresh).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('closes an invalid watcher on wake without waiting for a slow refresh', async () => {
  const scanning = deferred<void>();
  refresh.mockReturnValue(scanning.promise);
  mocks.stat.mockRejectedValue(Error('missing'));
  const checking = monitor.check();
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledOnce();
  expect(watchers[0].close).toHaveBeenCalledOnce();
  scanning.resolve();
  await checking;
});
