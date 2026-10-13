import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CancellationToken } from 'builder-util-runtime';
import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater';

const hooks = vi.hoisted(() => ({ differential: vi.fn() }));
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events');
  class Updater extends EventEmitter {
    executeDownload(options: DownloadExecutorTask) { return options; }
    differentialDownloadInstaller() { return hooks.differential(this); }
  }
  return { MacUpdater: Updater, NsisUpdater: Updater, AppImageUpdater: Updater };
});
import { createUpdateTransport } from '../src/main/update-transport';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(['win32', 'darwin'] as const)('%s keeps differential progress separate and resumes sampling only after full-download fallback', async platform => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
  vi.useFakeTimers();
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-differential-'));
  const destination = path.join(directory, 'update');
  const updater = createUpdateTransport();
  const report = vi.fn();
  updater.on('download-progress', report);
  const native = { percent: 50, transferred: 35, total: 70, bytesPerSecond: 10, delta: 35 };
  hooks.differential.mockImplementation(async (transport: EventEmitter) => {
    // Copying old blocks grows the file before the first network progress event.
    await writeFile(destination, Buffer.alloc(30));
    await vi.advanceTimersByTimeAsync(1100);
    expect(report).not.toHaveBeenCalled();
    transport.emit('download-progress', native);
    await vi.advanceTimersByTimeAsync(1100);
    expect(report).toHaveBeenCalledExactlyOnceWith(native);
    return false;
  });
  const run = (task: DownloadExecutorTask['task']) => {
    const options = { fileInfo: { info: { size: 160 } }, task } as DownloadExecutorTask;
    const wrapped = (updater as any).executeDownload(options) as DownloadExecutorTask;
    return wrapped.task(destination, { onProgress: progress => updater.emit('download-progress', progress), cancellationToken: new CancellationToken() }, null, async () => {});
  };
  try {
    await run(async () => {
      await (updater as any).differentialDownloadInstaller();
      await vi.advanceTimersByTimeAsync(1100); // Verification must not re-enable sampling.
    });
    expect(report).toHaveBeenCalledExactlyOnceWith(native);
    expect(vi.getTimerCount()).toBe(0);

    report.mockClear();
    hooks.differential.mockResolvedValue(true);
    await run(async () => {
      await (updater as any).differentialDownloadInstaller();
      await writeFile(destination, Buffer.alloc(80));
      await vi.advanceTimersByTimeAsync(1100);
      await vi.waitFor(() => expect(report).toHaveBeenCalled());
    });
    expect(report.mock.lastCall?.[0]).toMatchObject({ total: 160, transferred: 80, percent: 50 });
    expect(vi.getTimerCount()).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
