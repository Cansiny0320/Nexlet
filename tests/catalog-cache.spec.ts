import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('Windows restart restores cached apps and icons, then refreshes resources and survives cache corruption', async () => {
  test.skip(process.platform !== 'win32', 'Windows catalog cache');
  test.setTimeout(120000);
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/catalog-cache-'));
  const shortcuts = path.join(data, 'shortcuts');
  const menu = path.join(shortcuts, 'menu'),
    desktop = path.join(shortcuts, 'desktop');
  await mkdir(menu, { recursive: true });
  await mkdir(desktop, { recursive: true });
  const firstLink = path.join(desktop, 'Cache editor.lnk');
  const duplicate = path.join(menu, 'Cache editor copy.lnk');
  const removed = path.join(menu, 'Cache removed.lnk');
  const added = path.join(menu, 'Cache added.lnk');
  const iconFile = path.join(data, 'custom.png');
  const idFor = (file: string) =>
    'app:' + createHash('sha256').update(file.toLowerCase()).digest('hex').slice(0, 20);
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: data,
    NEXLET_TEST_DEFER_CATALOG_SCAN: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: [process.cwd()], env });
  try {
    let page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    const colors = await app.evaluate(({ nativeImage }) =>
      [Buffer.from([0, 0, 255, 255]), Buffer.from([0, 255, 0, 255])].map((pixel) => {
        const bitmap = Buffer.alloc(16 * 16 * 4);
        for (let offset = 0; offset < bitmap.length; offset += 4) pixel.copy(bitmap, offset);
        return nativeImage.createFromBitmap(bitmap, { width: 16, height: 16 }).toDataURL();
      }),
    );
    await writeFile(iconFile, Buffer.from(colors[0].split(',')[1], 'base64'));
    expect(
      await app.evaluate(
        ({ shell }, fixture) =>
          [fixture.firstLink, fixture.duplicate, fixture.removed].map((file, index) =>
            shell.writeShortcutLink(file, 'create', {
              target: process.execPath,
              args: index === 2 ? '--removed-fixture' : '--editor-fixture',
              cwd: fixture.menu,
              icon: fixture.iconFile,
              iconIndex: 0,
            }),
          ),
        { firstLink, duplicate, removed, menu, iconFile },
      ),
    ).toEqual([true, true, true]);
    await page.evaluate(
      (directory) => (window as any).nexlet.call('settings', { searchPaths: [directory] }),
      shortcuts,
    );
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading))
      .toBe(false);
    await app.evaluate(
      (_, ids) => {
        const n = (globalThis as any).__nexlet;
        n.store.set('pinned', ids);
        n.store.set('recent', ids);
        n.store.set('cache-sentinel', 'preserved');
        n.main.webContents.send('host-change', 'state');
      },
      [idFor(duplicate), idFor(removed)],
    );
    const editor = () => page.locator(`[data-command-id="${idFor(firstLink)}"]`);
    await expect(editor().locator('img')).toHaveAttribute('src', colors[0]);
    const firstState = await page.evaluate(() => (window as any).nexlet.call('state'));
    expect(firstState.pinned).toContain(idFor(firstLink));
    await app.close();

    // Change the source while Nexlet is closed. A restored first frame must
    // still show the old cached bitmap and deleted entry before refresh starts.
    await writeFile(iconFile, Buffer.from(colors[1].split(',')[1], 'base64'));
    await unlink(removed);
    app = await electron.launch({ args: [process.cwd()], env });
    page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await expect(editor().locator('img')).toHaveAttribute('src', colors[0]);
    await expect(page.getByRole('button', { name: 'Cache removed', exact: true })).toBeVisible();
    const restored = await page.evaluate(() => (window as any).nexlet.call('state'));
    expect(restored.catalogRevision).toBe(1);
    expect(restored.pinned).toEqual(firstState.pinned);
    expect(restored.recent).toEqual(firstState.recent);
    expect(
      await app.evaluate(
        ({ shell }, file) =>
          shell.writeShortcutLink(file, 'create', {
            target: process.execPath,
            args: '--added-fixture',
          }),
        added,
      ),
    ).toBe(true);
    await page.evaluate(() => (window as any).nexlet.call('rescan'));
    await expect(editor().locator('img')).toHaveAttribute('src', colors[1]);
    await expect(page.getByRole('button', { name: 'Cache removed', exact: true })).toHaveCount(0);
    const refreshed = await page.evaluate(() => (window as any).nexlet.call('state'));
    expect(refreshed.commands.some((item: any) => item.name === 'Cache added')).toBe(true);
    expect(refreshed.commands.some((item: any) => item.name === 'Cache removed')).toBe(false);
    await page.screenshot({ path: 'test-results/catalog-cache-refreshed.png' });
    await app.close();

    await writeFile(path.join(data, 'catalog-cache.sqlite'), 'corrupt disposable cache');
    // Normal automatic startup refresh, with no deferred-scan test override.
    app = await electron.launch({
      args: [process.cwd()],
      env: { ...env, NEXLET_TEST_DEFER_CATALOG_SCAN: '0' },
    });
    page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading))
      .toBe(false);
    await expect(editor().locator('img')).toHaveAttribute('src', colors[1]);
    expect(
      await app.evaluate(() => (globalThis as any).__nexlet.store.get('cache-sentinel', null)),
    ).toBe('preserved');
    expect(
      await app.evaluate(() =>
        (globalThis as any).__nexlet.catalog.items.some((item: any) => item.name === 'Cache added'),
      ),
    ).toBe(true);
    console.log(
      'Catalog cache restart, changed icon, removed/new app, aliases and corruption recovery verified.',
    );
  } finally {
    await app.close();
  }
});
