import { stat } from 'node:fs/promises';
import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater';

// Some proxies omit Content-Length, so electron-updater emits no progress events.
// Sample the exact file selected by the updater, without changing its download or verification.
export function withDownloadProgress(options: DownloadExecutorTask): DownloadExecutorTask {
  return { ...options, task: async (destination, downloadOptions, ...rest) => {
    const total = options.fileInfo.info.size ?? 0;
    const report = downloadOptions.onProgress;
    let active = true, reading = false, receivedProgress = false;
    let previousBytes = 0, previousTime = Date.now();
    const timer = setInterval(async () => {
      if (reading || receivedProgress || !report) return;
      reading = true;
      try {
        const { size } = await stat(destination);
        if (!active || receivedProgress) return;
        const now = Date.now();
        const delta = Math.max(0, size - previousBytes);
        const bytesPerSecond = delta * 1000 / Math.max(1, now - previousTime);
        previousBytes = size; previousTime = now;
        report({ total, transferred: size, delta, bytesPerSecond, percent: total > 0 ? Math.min(100, size / total * 100) : NaN });
      } catch { /* The file may not exist while connecting, or may already have been renamed. */ }
      finally { reading = false; }
    }, 1000);
    try {
      return await options.task(destination, { ...downloadOptions, onProgress: progress => {
        receivedProgress = true;
        report?.(progress);
      } }, ...rest);
    } finally { active = false; clearInterval(timer); }
  } };
}
