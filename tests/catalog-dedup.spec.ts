import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('Windows shortcut copies appear once and saved pins still work', async () => {
  test.skip(process.platform !== 'win32', 'Windows shortcuts');
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/catalog-dedup-'));
  const shortcuts = path.join(data, 'shortcuts');
  const menu = path.join(shortcuts, 'menu');
  const desktop = path.join(shortcuts, 'desktop');
  await mkdir(menu, { recursive: true });
  await mkdir(desktop, { recursive: true });
  const first = path.join(menu, 'Dedup fixture.lnk');
  const second = path.join(desktop, 'Dedup fixture.lnk');
  const variant = path.join(menu, 'Dedup variant.lnk');
  const idFor = (file: string) => 'app:' + createHash('sha256').update(file.toLowerCase()).digest('hex').slice(0, 20);
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading)).toBe(false);
    const created = await app.evaluate(({ shell }, links) => links.map((file, i) => shell.writeShortcutLink(file, 'create', {
      target: process.execPath, args: i === 2 ? '--dedup-variant' : '--dedup-fixture', cwd: links[0].slice(0, links[0].lastIndexOf('\\'))
    })), [first, second, variant]);
    expect(created).toEqual([true, true, true]);
    const call = (action: string, payload?: unknown) => page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), { action, payload });
    await app.evaluate((_, saved) => {
      const n = (globalThis as any).__nexlet;
      n.store.set('pinned', saved);
      n.store.set('recent', [...saved].reverse());
    }, [idFor(first), idFor(second)]);
    await call('settings', { searchPaths: [shortcuts] });
    await expect.poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading)).toBe(false);
    const state = await call('state');
    const fixture = state.commands.filter((item: any) => item.name === 'Dedup fixture');
    expect(fixture).toHaveLength(1);
    expect(state.commands.filter((item: any) => item.name === 'Dedup variant')).toHaveLength(1);
    expect(state.pinned).toEqual([fixture[0].id]);
    expect(state.recent).toEqual([fixture[0].id]);
    await page.locator('.launcher-input').fill('Dedup fixture');
    await expect(page.getByRole('button', { name: 'Dedup fixture', exact: true })).toHaveCount(1);
    await call('pin', fixture[0].id);
    expect((await call('state')).pinned).toEqual([]);
    await call('rescan');
    expect((await call('state')).recent).toEqual([fixture[0].id]);
    // Read back real catalog results as additional local verification.
    const qqEntries = state.commands.filter((item: any) => /QQ/i.test(item.name)).map((item: any) => ({ name: item.name, path: item.path }));
    console.log('QQ catalog after deduplication:', JSON.stringify(qqEntries));
  } finally { await app.close(); }
});
