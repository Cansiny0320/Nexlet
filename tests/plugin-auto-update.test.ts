import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { EventEmitter } from 'node:events';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('electron', () => ({ app: { getVersion: () => '0.2.11' }, net: { request } }));
import { downloadBounded, Marketplace } from '../src/main/marketplace';
import type { PluginRecord } from '../src/shared/types';

let pending: EventEmitter & { end: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  pending = Object.assign(new EventEmitter(), { end: vi.fn(), abort: vi.fn() });
  request.mockReturnValue(pending);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it.each([2000, 10000])(
  'aborts the network at the %i ms deadline without accepting late data',
  async (timeoutMs) => {
    const result = downloadBounded('https://github.com/example', 1024, { timeoutMs }).catch(
      (e) => e.message,
    );
    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(pending.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(pending.abort).toHaveBeenCalledOnce();
    expect(await result).toContain('超时');
    pending.emit('response', Object.assign(new EventEmitter(), { statusCode: 200, headers: {} }));
    expect(pending.abort).toHaveBeenCalledOnce();
  },
);

it('aborts promptly when the pending plugin launch is cancelled', async () => {
  const controller = new AbortController(),
    result = downloadBounded('https://github.com/example', 1024, {
      timeoutMs: 10000,
      signal: controller.signal,
    }).catch((e) => e.message);
  controller.abort();
  await Promise.resolve();
  expect(pending.abort).toHaveBeenCalledOnce();
  expect(await result).toContain('取消');
  expect(vi.getTimerCount()).toBe(0);
});

it('does not start an already-cancelled request', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    downloadBounded('https://github.com/example', 1024, { signal: controller.signal }),
  ).rejects.toThrow('取消');
  expect(request).not.toHaveBeenCalled();
});

it.each([false, true])(
  'background checks use separate success/failure backoff (failure=%s)',
  async (failure) => {
    const download = failure
      ? vi.fn().mockRejectedValue(Error('offline'))
      : vi.fn().mockResolvedValue(Buffer.from(JSON.stringify({ schemaVersion: 1, plugins: [] })));
    const market = new Marketplace({ set: vi.fn() } as any, {} as any, download);
    const record = {
      source: 'marketplace',
      enabled: true,
      development: false,
      manifest: { id: 'org.test', version: '1.0.0' },
    } as PluginRecord;
    const check = () => market.prepareUpdate(record, 'open', new AbortController().signal);
    await check();
    await check();
    expect(download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync((failure ? 60_000 : 30 * 60_000) - 1);
    await check();
    expect(download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await check();
    expect(download).toHaveBeenCalledTimes(2);
  },
);
