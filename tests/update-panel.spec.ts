import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite-plus/pack';

test('默认和无更新时只显示当前版本，手动检查发现新版时显示新版版本号', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'nexlet-update-status-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.updates.transport = {
        checkForUpdates: () =>
          new Promise<void>((resolve) => {
            n.finishUpdateCheck = (version: string | null) => {
              n.updates.set({ phase: version ? 'available' : 'latest', version });
              resolve();
            };
          }),
      };
      Object.assign(n.updates.status, { mode: 'automatic', phase: 'idle' });
      n.main.webContents.send('host-change', 'navigate:settings');
      n.main.webContents.send('host-change', 'state');
    });
    const row = page.locator('.setting-row').filter({ hasText: '应用更新' });
    const state = await page.evaluate(() => window.nexlet.call('state'));
    await expect(row.locator('strong + p')).toHaveText(`Nexlet ${state.version}`);
    await expect(row.getByRole('status')).toHaveCount(0);
    for (const version of [null, '99.0.0']) {
      await row.getByRole('button', { name: '检查更新', exact: true }).click();
      await expect(row.getByRole('status')).toHaveText('正在检查更新…');
      await expect(row.getByRole('button')).toBeDisabled();
      await app.evaluate(
        (_, version) => (globalThis as any).__nexlet.finishUpdateCheck(version),
        version,
      );
      if (version) {
        await expect(row.getByRole('status')).toHaveText(`发现新版本 ${version}`);
        await expect(row.getByRole('button', { name: '下载更新', exact: true })).toBeEnabled();
      } else {
        await expect(row.getByRole('button', { name: '检查更新', exact: true })).toBeEnabled();
        await expect(row.getByRole('status')).toHaveCount(0);
      }
      await expect(row.locator('strong + p')).toHaveText(`Nexlet ${state.version}`);
    }
  } finally {
    await app.close();
  }
});

test('点击重启安装直接执行更新，不再弹出二次确认', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'nexlet-update-install-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.updateInstallCalls = [];
      n.updates.transport = {
        quitAndInstall: (...args: boolean[]) => n.updateInstallCalls.push(args),
      };
      Object.assign(n.updates.status, {
        mode: 'automatic',
        phase: 'downloaded',
        version: '99.0.0',
      });
      n.main.webContents.send('host-change', 'navigate:settings');
      n.main.webContents.send('host-change', 'state');
    });
    await expect(page.getByRole('status')).toHaveText('版本 99.0.0 已下载，准备安装');
    // 记录瞬时弹窗，避免只检查最终 DOM 漏掉确认框。
    await page.evaluate(() => {
      (window as any).__updateConfirmationShown = false;
      new MutationObserver(() => {
        if (document.querySelector('.modal-backdrop'))
          (window as any).__updateConfirmationShown = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page
      .locator('.setting-row')
      .filter({ hasText: '应用更新' })
      .getByRole('button', { name: '重启安装', exact: true })
      .click();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__nexlet.updateInstallCalls))
      .toEqual([[true, true]]);
    expect(await page.evaluate(() => (window as any).__updateConfirmationShown)).toBe(false);
    await expect(page.getByRole('status')).toHaveText('正在准备安装并重启…');
  } finally {
    await app.close();
  }
});

test('更新说明显示格式，下载显示实际字节、速度和校验阶段', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'nexlet-update-panel-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.locator('.launcher-input')).toBeVisible();
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.updates.status = {
        mode: 'automatic',
        phase: 'downloading',
        version: '0.2.6',
        percent: 25,
        transferred: 33750000,
        total: 135000000,
        bytesPerSecond: 250000,
        notes:
          '<p>Nexlet 0.2.6 修复启动器应用图标显示。</p><h2>修复</h2><ul><li>展开「全部工具」时加载真实图标。</li><li>补齐最近使用的应用图标。</li></ul><h2>下载与更新</h2><p>Apple Silicon Mac：<code>Nexlet-0.2.6-macOS-arm64.dmg</code></p><p>文本 &amp; 字符</p><script>window.notesExecuted=true</script><img src="https://invalid.example/test.png" onerror="window.notesExecuted=true"><p onclick="window.notesExecuted=true">安全文本</p>',
        error: null,
      };
      n.main.webContents.send('host-change', 'navigate:settings');
      n.main.webContents.send('host-change', 'state');
    });
    await page.getByText('版本更新说明', { exact: true }).click();
    await expect(page.getByRole('heading', { name: '修复', exact: true })).toBeVisible();
    await expect(page.locator('.release-notes li')).toHaveCount(2);
    await expect(page.locator('.release-notes code')).toHaveText('Nexlet-0.2.6-macOS-arm64.dmg');
    await expect(page.locator('.release-notes')).toContainText('文本 & 字符');
    await expect(
      page.locator('.release-notes script, .release-notes img, .release-notes [onclick]'),
    ).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('正在下载 25%');
    await expect(page.locator('.update-progress-meta')).toHaveText(
      '已下载 33.8 MB / 135.0 MB250.0 KB/s',
    );
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '25');
    await page.locator('.release-notes').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('update-panel.png') });
    expect(await page.evaluate(() => (window as any).notesExecuted)).toBeUndefined();
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      Object.assign(n.updates.status, {
        percent: null,
        transferred: null,
        total: null,
        bytesPerSecond: null,
        notes: '普通文本第一行\n第二行',
      });
      n.main.webContents.send('host-change', 'state');
    });
    await expect(page.getByRole('status')).toHaveText('正在连接下载，请稍候…');
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('value');
    await expect(page.locator('.release-notes-plain')).toHaveText('普通文本第一行\n第二行');
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      Object.assign(n.updates.status, { percent: 100, transferred: 135000000, total: 135000000 });
      n.main.webContents.send('host-change', 'state');
    });
    await expect(page.getByRole('status')).toHaveText('下载完成，正在校验更新包…');
    await expect(page.getByRole('button', { name: '重启安装', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('Electron 分块下载没有 Content-Length 时仍显示进度并保留 SHA512 校验', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-chunked-update-'));
  const helper = path.join(directory, 'progress.cjs');
  await build({
    config: false,
    entry: ['src/main/update-progress.ts'],
    deps: { alwaysBundle: [/.*/] },
    platform: 'node',
    format: 'cjs',
    dts: false,
    outDir: path.dirname(helper),
    outExtensions: () => ({ js: '.cjs' }),
    outputOptions: { entryFileNames: path.basename(helper) },
  });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(directory, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const result = await app.evaluate(
      async (_, { helper, directory, root }) => {
        const require = process.getBuiltinModule('module').createRequire(root + '/package.json');
        const { createServer } = require('node:http');
        const { createHash } = require('node:crypto');
        const { readFile } = require('node:fs/promises');
        const { ElectronHttpExecutor } = require(
          root + '/node_modules/electron-updater/out/electronHttpExecutor.js',
        );
        const { CancellationToken } = require(root + '/node_modules/builder-util-runtime');
        const { withDownloadProgress } = require(helper);
        const payload = Buffer.alloc(12000, 'x');
        const native: unknown[] = [],
          fallback: { percent: number; transferred: number }[] = [];
        const server = createServer((_request: unknown, response: any) => {
          response.writeHead(200, { 'Content-Type': 'application/zip' });
          response.write(payload.subarray(0, 4000));
          setTimeout(() => response.write(payload.subarray(4000, 8000)), 1200);
          setTimeout(() => response.end(payload.subarray(8000)), 2400);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
          const executor = new ElectronHttpExecutor();
          const destination = directory + '/update.zip';
          const url = new URL(`http://127.0.0.1:${server.address().port}/update.zip`);
          const task = withDownloadProgress({
            fileInfo: { info: { size: payload.length } },
            task: async (file: string, options: any) =>
              executor.download(url, file, {
                ...options,
                onProgress: (progress: unknown) => {
                  native.push(progress);
                  options.onProgress(progress);
                },
              }),
          });
          await task.task(
            destination,
            {
              cancellationToken: new CancellationToken(),
              sha512: createHash('sha512').update(payload).digest('base64'),
              onProgress: (progress: any) => fallback.push(progress),
            },
            null,
            async () => {},
          );
          let rejectedCorrupt = false;
          try {
            await task.task(
              directory + '/corrupt.zip',
              {
                cancellationToken: new CancellationToken(),
                sha512: createHash('sha512').update('wrong content').digest('base64'),
              },
              null,
              async () => {},
            );
          } catch {
            rejectedCorrupt = true;
          }
          return {
            nativeCount: native.length,
            fallback,
            complete: (await readFile(destination)).equals(payload),
            rejectedCorrupt,
          };
        } finally {
          await new Promise<void>((resolve) => server.close(resolve));
        }
      },
      { helper, directory, root: process.cwd() },
    );
    expect(result.nativeCount).toBe(0);
    expect(
      result.fallback.some(
        (progress) => progress.percent > 0 && progress.percent < 100 && progress.transferred > 0,
      ),
    ).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.rejectedCorrupt).toBe(true);
  } finally {
    await app.close();
  }
});
