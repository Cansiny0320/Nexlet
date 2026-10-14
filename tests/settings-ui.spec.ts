import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

let app: ElectronApplication, page: Page;
const errors: string[] = [];
async function call(action: string, payload?: unknown): Promise<any> {
  return page.evaluate(({ action, payload }) => window.nexlet.call(action as any, payload), { action, payload });
}
async function choose(label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}
test.beforeAll(async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.join(process.cwd(), '.tmp', 'settings-ui-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd()], env });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await call('settings', { theme: 'light', hideOnBlur: false });
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '主题', exact: true })).toBeVisible();
});
test.afterAll(async () => { await app?.close(); });
test.describe.configure({ mode: 'serial' });

test('下拉框与输入框等高，Escape 关闭菜单并恢复焦点', async () => {
  const theme = page.getByRole('combobox', { name: '主题', exact: true });
  const inputBox = await page.getByLabel('全局快捷键', { exact: true }).boundingBox();
  const selectBox = await theme.boundingBox();
  expect(Math.abs(selectBox!.height - inputBox!.height)).toBeLessThanOrEqual(1);
  await theme.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: '浅色', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(theme).toBeFocused();
  await expect(page.locator('.settings-panel')).toBeVisible();
  await theme.click();
  await expect(page.getByRole('option', { name: '浅色', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: '记录剪贴板历史', exact: true })).toBeFocused();
});

test('键盘选择主题和数值设置写入实际状态，重开页面保留', async () => {
  const theme = page.getByRole('combobox', { name: '主题', exact: true });
  await theme.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: '浅色', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: '深色', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await call('state')).settings.theme).toBe('dark');
  await choose('保留条数', '1000 条');
  await choose('保留天数', '90 天');
  await expect.poll(async () => (await call('state')).settings.maxClipboardItems).toBe(1000);
  await expect.poll(async () => (await call('state')).settings.retentionDays).toBe(90);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '主题', exact: true })).toHaveText('深色');
  await expect(page.getByRole('combobox', { name: '保留条数', exact: true })).toHaveText('1000 条');
  await choose('主题', '跟随系统');
  await expect.poll(async () => (await call('state')).settings.theme).toBe('system');
});

test('开关支持键盘切换，禁用下拉框不打开', async () => {
  const control = page.getByRole('switch', { name: '记录剪贴板历史', exact: true });
  const before = (await call('state')).settings.clipboardEnabled;
  await control.focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await call('state')).settings.clipboardEnabled).toBe(!before);
  await expect(control).toHaveAttribute('aria-checked', String(!before));
  const panel = page.getByRole('switch', { name: '启用超级面板', exact: true });
  if (await panel.getAttribute('aria-checked') === 'true') await panel.click();
  await expect(page.getByRole('combobox', { name: '面板鼠标触发', exact: true })).toBeDisabled();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('功能编辑和本地启动项继续保存', async () => {
  await page.getByLabel('筛选功能').fill('JSON');
  await page.locator('.command-management-row').filter({ hasText: 'JSON 工具' }).click();
  await page.getByLabel('功能别名').fill('基础组件回归');
  await page.getByText('禁用此功能', { exact: true }).click();
  await expect(page.getByRole('switch', { name: '禁用此功能', exact: true })).toBeChecked();
  await page.getByText('禁用此功能', { exact: true }).click();
  await expect(page.getByRole('switch', { name: '禁用此功能', exact: true })).not.toBeChecked();
  await page.getByRole('switch', { name: '快捷键带入当前选区', exact: true }).check();
  await page.getByRole('button', { name: '保存功能设置', exact: true }).click();
  await expect.poll(async () => (await call('state')).commandConfig.commands['tool:json'].aliases).toEqual(['基础组件回归']);
  await expect.poll(async () => (await call('state')).commandConfig.commands['tool:json'].captureSelection).toBe(true);
  await page.getByRole('button', { name: '添加本地启动项', exact: true }).click();
  await page.getByLabel('本地项名称').fill('组件验证目录');
  await page.getByLabel('本地项路径').fill(process.cwd());
  await page.getByRole('button', { name: '保存本地项', exact: true }).click();
  await expect.poll(async () => (await call('state')).commandConfig.localEntries.some((entry: any) => entry.name === '组件验证目录')).toBe(true);
  expect(errors).toEqual([]);
});

test('浅深色与窄窗口菜单不被滚动容器裁切', async () => {
  await expect(page.locator('.toast')).toBeHidden();
  for (const width of [800, 640]) {
    await app.evaluate(({ BrowserWindow }, width) => {
      const window = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.isVisible())!;
      window.setContentSize(width, 600);
    }, width);
    for (const theme of ['light', 'dark']) {
      await call('settings', { theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('.settings-panel').evaluate(element => { element.scrollTop = 0; });
      const trigger = page.getByRole('combobox', { name: '主题', exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const menu = page.getByRole('listbox');
      await expect(menu).toBeVisible();
      await expect(page.locator('[data-slot=select-content]')).toHaveCSS('opacity', '1');
      const bounds = await menu.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: `test-results/settings-base-nova-${width}-${theme}.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
      expect(await page.locator('.settings-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
