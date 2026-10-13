import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

test('全部工具和展开的最近使用补齐图标，读取失败保留占位图', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/catalog-icons-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading)).toBe(false);
    const icon = await app.evaluate(({ nativeImage }, file) => {
      const n = (globalThis as any).__nexlet;
      n.catalog.items = Array.from({ length: 85 }, (_, i) => ({
        id: `app:icon-test-${i}`, name: `Icon fixture ${i}`, subtitle: 'Icon regression fixture',
        kind: 'app', keywords: [], path: file
      }));
      n.catalog.items.push({ id: 'app:missing-icon', name: 'Missing icon', subtitle: '', kind: 'app', keywords: [], path: `${file}/missing.png` });
      n.store.set('pinned', []);
      n.store.set('recent', []);
      n.main.webContents.send('host-change', 'state');
      return nativeImage.createFromPath(file).toDataURL();
    }, path.resolve('assets/icon.png'));
    await expect(page.locator('.launcher-footer')).toContainText('86 个应用');
    await page.getByRole('button', { name: '全部 >', exact: true }).click();
    await expect(page.locator('.tool-tile').filter({ hasText: /^Icon fixture / }).locator('img')).toHaveCount(85);
    await expect(page.getByRole('button', { name: 'Icon fixture 84', exact: true }).locator('img')).toHaveAttribute('src', icon);
    await expect(page.getByRole('button', { name: 'Missing icon', exact: true }).locator('.tool-icon')).toBeVisible();
    await page.screenshot({ path: 'test-results/catalog-icons-all.png' });
    await page.getByRole('button', { name: '返回固定', exact: true }).click();
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.store.set('recent', Array.from({ length: 21 }, (_, i) => `app:icon-test-${i}`));
      n.main.webContents.send('host-change', 'state');
    });
    // Remount the launcher so the recent-list check cannot reuse its all-tools icon state.
    await app.evaluate(() => (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:settings'));
    await expect(page.locator('.launcher-input')).toHaveCount(0);
    await app.evaluate(() => (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:launcher'));
    await page.getByRole('button', { name: '展开 (21)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Icon fixture 20', exact: true }).locator('img')).toHaveAttribute('src', icon);
  } finally { await app.close(); }
});

test('macOS 全部工具显示真实应用图标', async () => {
  test.skip(process.platform !== 'darwin', 'macOS 原生图标验证');
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/catalog-native-icons-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading)).toBe(false);
    await page.getByRole('button', { name: '全部 >', exact: true }).click();
    const names = await app.evaluate(() => ['Calculator', 'Calendar'].map(name => (globalThis as any).__nexlet.catalog.items.find((c: any) => c.path === `/System/Applications/${name}.app`).name));
    const calculator = page.getByRole('button', { name: names[0], exact: true }).locator('img');
    const calendar = page.getByRole('button', { name: names[1], exact: true }).locator('img');
    await expect(calculator).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(calendar).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(await calculator.getAttribute('src')).not.toBe(await calendar.getAttribute('src'));
    await page.screenshot({ path: 'test-results/catalog-icons-native-mac.png', fullPage: true });
  } finally { await app.close(); }
});
