import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let directory: string;
test.beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nexlet-backspace-'));
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
  app = await electron.launch({ args: [process.env.NEXLET_E2E_APP_ROOT || process.cwd()], env });
});
test.afterEach(async () => {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
});

test('empty clipboard search returns home; deleting text and composing stay in the tool', async () => {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  const search = page.getByRole('textbox', { name: '搜索剪贴板', exact: true });
  await search.fill('x');
  await search.press('End');
  await search.press('Backspace');
  await expect(search).toHaveValue('');
  await expect(page.locator('.app-shell')).toHaveClass(/view-clipboard/);
  for (const options of [
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
  ]) {
    await search.dispatchEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
      ...options,
    });
    await expect(page.locator('.app-shell')).toHaveClass(/view-clipboard/);
  }
  await search.evaluate((element) => {
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    element.dispatchEvent(event);
  });
  await expect(search).toBeVisible();
  await search.press('Backspace');
  await expect(page.locator('.launcher-input')).toBeVisible();
  await expect(page.locator('.launcher-input')).toBeFocused();
  await page.locator('.launcher-input').press('Backspace');
  await expect(page.locator('.launcher-input')).toBeVisible();

  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).press('Backspace');
  await expect(page.locator('.app-shell')).toHaveClass(/view-json/);
});

test('empty plugin search exits the session through the normal close lifecycle', async () => {
  const plugin = path.join(directory, 'plugin'),
    id = 'org.nexlet.backspace-fixture';
  await mkdir(plugin);
  await writeFile(
    path.join(plugin, 'plugin.json'),
    JSON.stringify({
      id,
      name: 'Backspace fixture',
      version: '1.0.0',
      apiVersion: 1,
      main: 'index.html',
      permissions: [],
      features: [{ code: 'test', name: 'Backspace fixture', keywords: ['backspace'] }],
    }),
  );
  await writeFile(
    path.join(plugin, 'index.html'),
    '<!doctype html><html><body>Backspace fixture<script src="main.js"></script></body></html>',
  );
  await writeFile(
    path.join(plugin, 'main.js'),
    'nexlet.onEnter(()=>nexlet.search.set({text:"x",placeholder:"Fixture query"}));nexlet.onOut(()=>nexlet.storage.set("closed",true));',
  );
  const page = await app.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await app.evaluate(({ dialog }, plugin) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [plugin] });
  }, plugin);
  await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
  await page.evaluate((id) => window.nexlet.call('launch', { id: `plugin:${id}:test` }), id);
  const search = page.getByRole('textbox', { name: '插件搜索', exact: true });
  await expect(search).toHaveValue('x');
  await search.press('End');
  await search.press('Backspace');
  await expect(search).toHaveValue('');
  await expect(page.locator('.app-shell')).toHaveClass(/view-plugin/);
  await search.press('Backspace');
  await expect(page.locator('.launcher-input')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.nexlet.call('pluginSession'))).toBeNull();
  expect(
    await app.evaluate(
      (_, id) => (globalThis as any).__nexlet.plugins.store.get('plugin-data:' + id, {}).closed,
      id,
    ),
  ).toBe(true);
});

test('empty search in a detached clipboard window keeps the window and tool open', async () => {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  const detached = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const popup = await detached;
  const search = popup.getByRole('textbox', { name: '搜索剪贴板', exact: true });
  await expect(search).toHaveValue('');
  await search.press('Backspace');
  await expect(popup.locator('.app-shell')).toHaveClass(/view-clipboard/);
  await expect(search).toBeVisible();
});
