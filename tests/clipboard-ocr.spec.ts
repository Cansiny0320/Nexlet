import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
test('真实离线 OCR 可搜索、独立于可见会话，取消与删除后不写回', async () => {
  const pluginDirectory = path.resolve('../Nexlet-plugins/.build/plugins/ocr');
  test.skip(!existsSync(path.join(pluginDirectory, 'ocr-index.html')), '需要已构建的官方 OCR 插件');
  test.setTimeout(120000);
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-ocr-index-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await page.evaluate(() =>
      window.nexlet.call('settings', {
        clipboardEnabled: false,
        hideOnBlur: false,
        autoCheckUpdates: false,
      }),
    );
    await expect(
      page.evaluate(() => window.nexlet.call('clipOcr', { action: 'run', ids: [] })),
    ).rejects.toThrow('请先安装');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      dialog.showMessageBox = async () => ({ response: 1 }) as any;
    }, pluginDirectory);
    await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
    await page.evaluate(() =>
      window.nexlet.call('capabilitySettings', {
        action: 'default',
        capability: 'ocr',
        id: 'org.nexlet.ocr:paddle',
      }),
    );
    await page.evaluate(() =>
      window.nexlet.call('launch', { id: 'plugin:org.nexlet.ocr:recognize', mode: 'open' }),
    );
    const visible = await app.evaluate(async () => {
      const active = (globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.ocr');
      await active.queue;
      await active.view.webContents.executeJavaScript(
        "document.querySelector('#result').value='visible draft'",
      );
      return active.view.webContents.id;
    });
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, path.resolve('docs/screenshots/filesearch.png'));
    await page.evaluate(() => window.nexlet.call('clipOcr', { action: 'import' }));
    await app.evaluate(() => (globalThis as any).__nexlet.clipboardOcr.idle());
    const tasks = await page.evaluate(() => window.nexlet.call('clipOcr', { action: 'status' }));
    expect(tasks[0], JSON.stringify(tasks)).toMatchObject({ status: 'done' });
    const result = await page.evaluate(() => window.nexlet.call('clipIndex', { query: 'Nexlet' }));
    expect(result.ids).toHaveLength(1);
    const detail = await page.evaluate((id) => window.nexlet.call('clipDetail', id), result.ids[0]);
    expect(detail?.ocrText).toContain('Nexlet');
    expect(
      await app.evaluate(async () => {
        const active = (globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.ocr');
        return [
          active.view.webContents.id,
          await active.view.webContents.executeJavaScript(
            "document.querySelector('#result').value",
          ),
        ];
      }),
    ).toEqual([visible, 'visible draft']);
    await page.evaluate(
      (id) => window.nexlet.call('clipOcr', { action: 'clear', ids: [id] }),
      result.ids[0],
    );
    expect(
      (await page.evaluate(() => window.nexlet.call('clipIndex', { query: 'Nexlet' }))).ids,
    ).toEqual([]);
    await page.evaluate(
      (id) => window.nexlet.call('clipOcr', { action: 'run', ids: [id] }),
      result.ids[0],
    );
    await page.evaluate(
      (id) => window.nexlet.call('clipOcr', { action: 'cancel', ids: [id] }),
      result.ids[0],
    );
    await app.evaluate(() => (globalThis as any).__nexlet.clipboardOcr.idle());
    expect(
      (await page.evaluate((id) => window.nexlet.call('clipDetail', id), result.ids[0]))?.ocrText,
    ).toBeUndefined();
    await page.evaluate(
      (id) => window.nexlet.call('clipOcr', { action: 'run', ids: [id] }),
      result.ids[0],
    );
    await page.evaluate(
      (id) => window.nexlet.call('clipAction', { action: 'delete', ids: [id] }),
      result.ids[0],
    );
    await app.evaluate(() => (globalThis as any).__nexlet.clipboardOcr.idle());
    expect(
      await page.evaluate((id) => window.nexlet.call('clipDetail', id), result.ids[0]),
    ).toBeUndefined();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
