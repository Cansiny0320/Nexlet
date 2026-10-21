import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

let application: ElectronApplication;
test.beforeEach(async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/lazy-tools-'));
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
  application = await electron.launch({
    args: [process.env.NEXLET_E2E_APP_ROOT || process.cwd()],
    env,
  });
});
test.afterEach(async () => {
  await application?.close();
});

test('homepage leaves tool code unloaded; JSON loads once and remains usable on reopening', async () => {
  const page = await application.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  // file: resource timing entries are not exposed by Chromium. Debugger.enable
  // reports already parsed scripts as well as subsequent dynamic imports.
  const debuggerSession = await page.context().newCDPSession(page);
  const scripts: string[] = [];
  debuggerSession.on('Debugger.scriptParsed', (script) => scripts.push(script.url));
  await debuggerSession.send('Debugger.enable');
  expect(
    scripts.filter((url) =>
      /\/(JsonTool|Scratchpad|Clipboard|Plugins|Settings|FileSearch)-/.test(url),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'JSON 输入', exact: true })).toBeVisible();
  const loaded = scripts.filter((url) => /\/JsonTool-.*\.js$/.test(url));
  expect(loaded).toHaveLength(1);
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill('{"value":123}');
  await expect(page.getByLabel('JSON 解析结果')).toContainText('123');
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'JSON 输入', exact: true })).toBeVisible();
  expect(scripts.filter((url) => /\/JsonTool-.*\.js$/.test(url))).toEqual(loaded);
});

test('failed tool chunk keeps the shell usable and can return home', async () => {
  const page = await application.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await application.evaluate(({ session, net }) => {
    session.defaultSession.protocol.handle('file', (request) =>
      /\/JsonTool-[^/]+\.js$/.test(new URL(request.url).pathname)
        ? new Response('fixture failure', { status: 500 })
        : net.fetch(request.url, { bypassCustomProtocolHandlers: true }),
    );
  });
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('工具加载失败');
  await page.getByRole('button', { name: '返回首页', exact: true }).first().click();
  await expect(page.locator('.launcher-input')).toBeVisible();
});

test('detaching waits for a delayed tool module before releasing the source', async () => {
  const page = await application.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill('{"draft":"keep me"}');
  await expect(page.getByLabel('JSON 解析结果')).toContainText('keep me');
  await application.evaluate(({ session, net }) => {
    session.defaultSession.protocol.handle('file', async (request) => {
      if (/\/JsonTool-[^/]+\.js$/.test(new URL(request.url).pathname)) {
        (globalThis as any).__waitingForTool = true;
        await new Promise<void>((resolve) => {
          (globalThis as any).__releaseTool = resolve;
        });
      }
      return net.fetch(request.url, { bypassCustomProtocolHandlers: true });
    });
  });
  const window = application.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const popup = await window;
  await expect
    .poll(() => application.evaluate(() => (globalThis as any).__waitingForTool))
    .toBe(true);
  // A delayed restore must not release the source draft before it completes.
  await page.waitForTimeout(150);
  await expect(page.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":"keep me"}',
  );
  await expect(page.getByRole('status')).toContainText('正在恢复独立窗口');
  await application.evaluate(() => (globalThis as any).__releaseTool());
  await expect(page.locator('.launcher-input')).toBeVisible();
  await expect(popup.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":"keep me"}',
  );
  await expect(popup.getByLabel('JSON 解析结果')).toContainText('keep me');
});

test('failed detached module retains the source tool and its draft', async () => {
  const page = await application.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill('{"draft":42}');
  await application.evaluate(({ session, net }) => {
    session.defaultSession.protocol.handle('file', (request) =>
      /\/JsonTool-[^/]+\.js$/.test(new URL(request.url).pathname)
        ? new Response('fixture failure', { status: 500 })
        : net.fetch(request.url, { bypassCustomProtocolHandlers: true }),
    );
  });
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.locator('.handoff-overlay')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":42}',
  );
  await expect.poll(() => application.windows().length).toBe(1);
});
