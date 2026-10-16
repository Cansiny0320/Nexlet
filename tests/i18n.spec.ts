import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app: ElectronApplication, page: Page, directory: string;
const errors: string[] = [];
async function launch(system = 'zh-CN') {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_TEST_LOCALE: system, NEXLET_USER_DATA: path.join(directory, 'data') };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.NEXLET_E2E_EXECUTABLE;
  app = await electron.launch({ executablePath, args: executablePath ? [] : [process.cwd()], env });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.launcher-input')).toBeVisible();
  await page.evaluate(() => window.nexlet.call('settings', { hideOnBlur: false }));
}
test.beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'nexlet-i18n-')); errors.length = 0; });
test.afterEach(async () => { await app?.close(); await rm(directory, { recursive: true, force: true }); });

test('language selection persists and changes detached windows without losing JSON input', async () => {
  await launch();
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).first().click();
  const source = '{"message":"用户数据 must stay unchanged","count":1}';
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill(source);
  const newWindow = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const detached = await newWindow;
  detached.on('pageerror', error => errors.push(error.message));
  await expect(detached.getByRole('textbox', { name: 'JSON 输入', exact: true })).toContainText(source);
  await detached.evaluate(() => { (window as any).__originalEditor = document.querySelector('.cm-content'); });
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByRole('combobox', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toBeVisible();
  await expect(detached.getByRole('textbox', { name: 'JSON input', exact: true })).toContainText(source);
  await expect(detached.locator('html')).toHaveAttribute('lang', 'en');
  expect(await detached.evaluate(() => (window as any).__originalEditor === document.querySelector('.cm-content'))).toBe(true);
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '繁體中文', exact: true }).click();
  await expect(detached.getByRole('textbox', { name: 'JSON 輸入', exact: true })).toContainText(source);
  await expect.poll(() => page.evaluate(async () => (await window.nexlet.call<any>('state')).settings.language)).toBe('zh-Hant');
  await app.close();
  await launch('en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  expect(errors).toEqual([]);
});

test('plugins receive application language without changing system locale or input', async () => {
  await launch('en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const plugin = path.join(directory, 'plugin'); await mkdir(plugin);
  await writeFile(path.join(plugin, 'plugin.json'), JSON.stringify({ id: 'org.nexlet.locale-test', name: '语言测试', locales: { en: { name: 'Language test' }, 'zh-Hant': { name: '語言測試' } }, version: '1.0.0', apiVersion: 1, main: 'index.html', permissions: [], features: [{ code: 'main', name: '语言测试', keywords: [] }] }));
  await writeFile(path.join(plugin, 'index.html'), '<!doctype html><html><body><p id="locale"></p><input id="input" value="keep 用户内容"><script src="main.js"></script></body></html>');
  await writeFile(path.join(plugin, 'main.js'), 'const apply=locale=>document.querySelector("#locale").textContent=locale;nexlet.i18n.onChange(apply);nexlet.i18n.getLocale().then(apply);');
  await app.evaluate(({ dialog }, plugin) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [plugin] }); }, plugin);
  await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
  await page.evaluate(() => window.nexlet.call('launch', { id: 'plugin:org.nexlet.locale-test:main' }));
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some(c => c.getURL().startsWith('nexlet-plugin://')))).toBe(true);
  const read = () => app.evaluate(async ({ webContents }) => {
    const contents = webContents.getAllWebContents().find(c => c.getURL().startsWith('nexlet-plugin://'))!;
    return contents.executeJavaScript('({locale:document.querySelector("#locale").textContent,value:document.querySelector("#input").value})');
  });
  await expect.poll(read).toEqual({ locale: 'en', value: 'keep 用户内容' });
  await page.evaluate(() => window.nexlet.call('settings', { language: 'zh-Hant' }));
  await expect.poll(read).toEqual({ locale: 'zh-Hant', value: 'keep 用户内容' });
  expect(errors).toEqual([]);
});
