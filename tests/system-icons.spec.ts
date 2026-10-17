import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

test('系统设置生成图覆盖最近、固定和搜索，目录原生图不覆盖设计', async () => {
  test.skip(!['darwin', 'win32'].includes(process.platform), '系统设置入口仅支持 Windows 和 macOS');
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/system-icons-'));
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
    const call = (action: string, payload?: unknown): Promise<any> =>
      page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), {
        action,
        payload,
      });
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
    for (const icon of [display, sound, power]) {
      await expect(icon).toHaveAttribute('src', /(?:assets\/[^/]+\.png|^data:image\/png;base64,)/);
      await expect
        .poll(() => icon.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBe(128);
    }
    const generatedDisplay = await display.getAttribute('src');
    expect(generatedDisplay).not.toBe(await sound.getAttribute('src'));
    await expect(
      page.getByRole('button', { name: '设置', exact: true }).locator('.tool-icon'),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/system-icons-home.png' });

    const icons = await call('catalogIcons', [
      'system:settings:display',
      'system:settings:bluetooth',
      'system:settings:nonexistent',
    ]);
    expect(icons).toHaveLength(2);
    if (process.platform === 'darwin') {
      expect(icons.find((c: any) => c.id === 'system:settings:display').icon).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(icons.find((c: any) => c.id === 'system:settings:bluetooth').icon).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(icons.find((c: any) => c.id === 'system:settings:display').icon).not.toBe(
        generatedDisplay,
      );
    }
    await page.locator('.launcher-input').fill('显示器');
    await expect(display).toHaveAttribute('src', generatedDisplay!);
    await call('settings', { theme: 'dark', hideOnBlur: false });
    await expect(display).toHaveAttribute('src', generatedDisplay!);
    await page.screenshot({ path: 'test-results/system-icons-search.png' });

    // Only render power/session actions; never execute them during visual checks.
    await page.locator('.launcher-input').fill('');
    const actions = ['lock', 'sleep', 'restart', 'shutdown', 'logout', 'desktop'];
    await app.evaluate((_, ids) => {
      const n = (globalThis as any).__nexlet;
      n.store.set(
        'pinned',
        ids.map((id) => `system:action:${id}`),
      );
      n.store.set('recent', []);
      n.main.webContents.send('host-change', 'state');
    }, actions);
    const actionImages = page.locator('[data-command-id^="system:action:"] .tool-image');
    await expect(actionImages).toHaveCount(6);
    for (let index = 0; index < actions.length; index++) {
      await expect
        .poll(() => actionImages.nth(index).evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBe(128);
    }
    const actionSources = await actionImages.evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).src),
    );
    expect(new Set(actionSources).size).toBe(6);
    await page.screenshot({ path: 'test-results/system-actions-dark.png' });
    await call('settings', { theme: 'light', hideOnBlur: false });
    await expect(actionImages).toHaveCount(6);
    expect(
      await actionImages.evaluateAll((images) =>
        images.map((image) => (image as HTMLImageElement).src),
      ),
    ).toEqual(actionSources);
    await page.screenshot({ path: 'test-results/system-actions-light.png' });
  } finally {
    await app.close();
  }
});
