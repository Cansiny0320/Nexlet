import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater';
import { CancellationToken, type DownloadOptions } from 'builder-util-runtime';
import { withDownloadProgress } from '../src/main/update-progress';

afterEach(() => vi.useRealTimers());

it('没有 Content-Length 的下载从真实文件计算大小、百分比和速度，结束后停止采样', async () => {
  vi.useFakeTimers();
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-progress-'));
  const destination = path.join(directory, 'update.zip');
  const report = vi.fn();
  let finish!: () => void;
  const options = {
    fileInfo: { info: { size: 1000 } },
    task: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  } as unknown as DownloadExecutorTask;
  try {
    const pending = withDownloadProgress(options).task(
      destination,
      { onProgress: report, cancellationToken: new CancellationToken() },
      null,
      async () => {},
    );
    await writeFile(destination, Buffer.alloc(250));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report.mock.calls[0][0]).toMatchObject({
      transferred: 250,
      total: 1000,
      percent: 25,
      bytesPerSecond: expect.any(Number),
    });
    expect(report.mock.calls[0][0].bytesPerSecond).toBeGreaterThan(0);
    await writeFile(destination, Buffer.alloc(500));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2));
    expect(report.mock.calls[1][0]).toMatchObject({ transferred: 500, percent: 50 });
    finish();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('优先透传更新库的原生进度，不覆盖差量下载进度，并在失败时清理采样', async () => {
  vi.useFakeTimers();
  const report = vi.fn();
  const progress = { percent: 50, transferred: 50, total: 100, bytesPerSecond: 10, delta: 50 };
  const options = {
    fileInfo: { info: { size: 1000 } },
    task: async (_: string, download: DownloadOptions) => {
      download.onProgress?.(progress);
      await vi.advanceTimersByTimeAsync(2000);
      throw new Error('checksum mismatch');
    },
  } as unknown as DownloadExecutorTask;
  await expect(
    withDownloadProgress(options).task(
      '/unused',
      { onProgress: report, cancellationToken: new CancellationToken() },
      null,
      async () => {},
    ),
  ).rejects.toThrow('checksum');
  expect(report).toHaveBeenCalledExactlyOnceWith(progress);
  expect(vi.getTimerCount()).toBe(0);
});
