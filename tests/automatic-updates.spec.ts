import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('自动检查开关持久化，后台发现新版后首页可进入更新面板', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'nexlet-auto-updates-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.locator('.launcher-input')).toBeVisible();
    await page.getByRole('button', { name: '打开设置', exact: true }).click();
    const toggle = page.getByRole('switch', { name: '自动检查更新', exact: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeDisabled();
    expect(await app.evaluate(() => (globalThis as any).__nexlet.updates.automaticCheckTimer === null)).toBe(true);
    const invalid = await page.evaluate(async () => {
      try { await window.nexlet.call('settings', { autoCheckUpdates: 'yes' }); return ''; }
      catch (error) { return String(error); }
    });
    expect(invalid).toContain('开关无效');

    // Only replace the release source; keep the real timer, IPC, store and UI.
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.updateCheckCount = 0;
      n.updates.status.mode = 'portable';
      n.updates.checkPortable = async () => {
        n.updateCheckCount++;
        return { version: '99.0.0', notes: '自动检查发现的版本说明', url: 'https://github.com/Cansiny0320/Nexlet/releases' };
      };
      n.main.webContents.send('host-change', 'state');
    });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await expect(page.getByRole('button', { name: '有新版本', exact: true })).toHaveCount(0);
    expect(await app.evaluate(() => (globalThis as any).__nexlet.updateCheckCount)).toBe(0);
    await expect(page.getByRole('button', { name: '有新版本', exact: true })).toBeVisible({ timeout: 40_000 });
    await page.screenshot({ path: test.info().outputPath('update-notice.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '有新版本', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('发现新版本 99.0.0');
    await expect(page.getByRole('button', { name: '下载便携版', exact: true })).toBeVisible();
    await page.getByText('版本更新说明', { exact: true }).click();
    await expect(page.locator('.release-notes')).toContainText('自动检查发现的版本说明');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      return { enabled: n.store.settings().autoCheckUpdates, scheduled: n.updates.automaticCheckTimer !== null, checks: n.updateCheckCount };
    })).toEqual({ enabled: false, scheduled: false, checks: 1 });
    await page.screenshot({ path: test.info().outputPath('automatic-updates.png'), animations: 'disabled' });
    expect(errors).toEqual([]);

    await app.close();
    app = await electron.launch({ args: [process.cwd()], env });
    const reopened = await app.firstWindow();
    await reopened.getByRole('button', { name: '打开设置', exact: true }).click();
    await expect(reopened.getByRole('switch', { name: '自动检查更新', exact: true })).toHaveAttribute('aria-checked', 'false');
  } finally { await app.close(); await rm(data, { recursive: true, force: true }); }
});
