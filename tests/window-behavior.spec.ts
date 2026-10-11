import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

function environment(data: string): Record<string, string> {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

test('工具标题和独立拖动区可拖动，交互控件仍可点击', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-drag-'));
  const env = environment(data);
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' })).toBeVisible();
    await expect(page.getByLabel('拖动窗口')).toBeVisible();
    await expect(page.getByLabel('拖动窗口')).toHaveCSS('-webkit-app-region', 'drag');
    await expect(page.locator('.launcher-input')).toHaveCSS('-webkit-app-region', 'no-drag');
    await app.evaluate(() => (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:json'));
    await expect(page.locator('.plugin-pill')).toHaveCSS('-webkit-app-region', 'drag');
    await expect(page.getByRole('button', { name: '关闭当前工具' })).toHaveCSS('-webkit-app-region', 'no-drag');
    await page.getByRole('button', { name: '关闭当前工具' }).click();
    await expect(page.locator('.launcher-input')).toBeVisible();
  } finally { await app.close(); }
});

test('最小化后唤起和重复启动都恢复窗口并取得焦点', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-focus-'));
  const env = environment(data);
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    for (const entry of ['show', 'second-instance', 'activate', 'restore']) {
      await app.evaluate(() => (globalThis as any).__nexlet.main.minimize());
      await expect.poll(() => app.evaluate(() => (globalThis as any).__nexlet.main.isMinimized())).toBe(true);
      await app.evaluate(async ({ app }, entry) => {
        if (entry === 'show') await (globalThis as any).__nexlet.show();
        else if (entry === 'restore') (globalThis as any).__nexlet.main.restore();
        else app.emit(entry as any, {} as any, [], process.cwd());
      }, entry);
      await expect.poll(() => app.evaluate(() => {
        const w = (globalThis as any).__nexlet.main;
        return { minimized: w.isMinimized(), visible: w.isVisible(), focused: w.isFocused(), topmost: w.isAlwaysOnTop() };
      })).toEqual({ minimized: false, visible: true, focused: true, topmost: false });
    }
  } finally { await app.close(); }
});

test('登录启动留在后台，手动唤起后显示，自启动开关读回系统状态', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-login-'));
  const env = environment(data);
  const app = await electron.launch({ args: [process.cwd(), '--autostart'], env });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState();
    await expect(page.locator('.launcher-input')).toBeAttached();
    expect(await app.evaluate(() => (globalThis as any).__nexlet.main.isVisible())).toBe(false);
    await app.evaluate(() => (globalThis as any).__nexlet.show());
    await expect.poll(() => app.evaluate(() => (globalThis as any).__nexlet.main.isFocused())).toBe(true);
    await app.evaluate(() => (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:settings'));
    await expect(page.getByRole('switch', { name: '开机自启动', exact: true })).toBeDisabled();
    // Only the OS boundary is replaced: never add a real startup entry while testing.
    await app.evaluate(({ app }) => {
      Object.defineProperty(app, 'isPackaged', { configurable: true, value: true });
      let enabled = false;
      (globalThis as any).__loginWrites = [];
      app.getLoginItemSettings = (() => ({ openAtLogin: enabled, executableWillLaunchAtLogin: enabled })) as any;
      app.setLoginItemSettings = (options: any) => { enabled = options.openAtLogin; (globalThis as any).__loginWrites.push(options); };
      (globalThis as any).__nexlet.main.webContents.send('host-change', 'state');
    });
    const toggle = page.getByRole('switch', { name: '开机自启动', exact: true });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await app.evaluate(() => (globalThis as any).__loginWrites.map((v: any) => v.openAtLogin))).toEqual([true, false]);
  } finally { await app.close(); }
});
