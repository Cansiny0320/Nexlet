import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

test('macOS 设置原生图标覆盖最近、固定、搜索和按需图标请求', async () => {
  test.skip(process.platform !== 'darwin', 'macOS 原生资源验证');
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/system-icons-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    const call = (action: string, payload?: unknown): Promise<any> => page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), { action, payload });
    await expect(page.locator('.launcher-input')).toBeVisible();
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.store.set('pinned', ['system:settings:display', 'tool:settings']);
      n.store.set('recent', ['system:settings:sound', 'system:settings:power']);
      n.main.webContents.send('host-change', 'state');
    });
    const display = page.getByRole('button', { name: '显示器设置', exact: true }).locator('img');
    const sound = page.getByRole('button', { name: '声音设置', exact: true }).locator('img');
    const power = page.getByRole('button', { name: '电源和睡眠设置', exact: true }).locator('img');
    for (const icon of [display, sound, power]) await expect(icon).toHaveAttribute('src', /^data:image\/png;base64,/);
    const nativeDisplay = await display.getAttribute('src');
    expect(nativeDisplay).not.toBe(await sound.getAttribute('src'));
    await expect(page.getByRole('button', { name: '设置', exact: true }).locator('.tool-icon')).toBeVisible();
    await page.screenshot({ path: 'test-results/system-icons-home.png' });

    const icons = await call('catalogIcons', ['system:settings:display', 'system:settings:bluetooth', 'system:settings:nonexistent']);
    expect(icons.find((c: any) => c.id === 'system:settings:display').icon).toBe(nativeDisplay);
    expect(icons.find((c: any) => c.id === 'system:settings:bluetooth').icon).toMatch(/^data:image\/png;base64,/);
    expect(icons).toHaveLength(2);
    await page.locator('.launcher-input').fill('显示器');
    await expect(display).toHaveAttribute('src', nativeDisplay!);
    await page.screenshot({ path: 'test-results/system-icons-search.png' });
  } finally { await app.close(); }
});
