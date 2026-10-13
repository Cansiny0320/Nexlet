import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

let application: ElectronApplication;
test.beforeEach(async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/clipboard-lru-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [process.cwd()], env });
  await expect((await application.firstWindow()).locator('.launcher-input')).toBeVisible();
  await application.evaluate(({ clipboard }) => {
    const n = (globalThis as any).__nexlet;
    n.clips.stop();
    // Exercise the real host/service/store flow without touching the user's clipboard or sending keys.
    clipboard.writeText = async (text: string) => { (globalThis as any).__copiedText = text; };
    n.platform.paste = async () => { (globalThis as any).__pasteRequested = true; };
    const now = Date.now();
    for (const [index, id] of ['old', 'middle', 'new'].entries()) n.store.addClip({
      id, kind: 'text', text: `LRU ${id}`, hash: id, createdAt: now - (3 - index) * 60000, favorite: false
    });
  });
});
test.afterEach(async () => { await application?.close(); });

test('reuse refreshes visible order, keeps keyboard focus, and shows exact local time', async () => {
  const page = await application.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  const rows = page.locator('.clip-item');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('LRU new');
  const time = rows.first().locator('time');
  await expect(time).toHaveText(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  await expect(rows.first().locator('.clip-meta')).toContainText('1 分钟前');
  const localTime = await time.evaluate(node => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(new Date(node.getAttribute('datetime')!)));
  await expect(time).toHaveText(localTime);
  await rows.filter({ hasText: 'LRU old' }).click();
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await expect(rows.first()).toContainText('LRU old');
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
  await expect(rows.first().locator('.clip-meta')).toContainText('刚刚');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(1)).toContainText('LRU new');
  await page.evaluate(() => window.nexlet.call('clipAction', { action: 'paste', ids: ['middle'] }));
  await application.evaluate(() => { (globalThis as any).__nexlet.main.show(); });
  await expect(rows.first()).toContainText('LRU middle');
  expect(await application.evaluate(() => ({ text: (globalThis as any).__copiedText, paste: (globalThis as any).__pasteRequested })))
    .toEqual({ text: 'LRU middle', paste: true });
  await page.screenshot({ path: 'test-results/clipboard-lru.png' });
});
