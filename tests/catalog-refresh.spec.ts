import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

test('macOS installation and removal update the visible search without a manual rescan', async () => {
  test.skip(process.platform !== 'darwin', 'macOS application bundles');
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/catalog-refresh-'));
  const applications = path.join(data, 'Applications');
  const later = path.join(data, 'Later');
  await mkdir(applications);
  const name = 'Nexlet Auto Refresh Fixture';
  const bundle = path.join(applications, 'Tools', name + '.app');
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(data, 'profile'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading), {
        timeout: 30_000,
      })
      .toBe(false);
    await page.evaluate(
      (folders) => (window as any).nexlet.call('settings', { searchPaths: folders }),
      [applications, later],
    );
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__nexlet.catalog.loading))
      .toBe(false);
    await page.locator('.launcher-input').fill(name);
    const result = page.getByRole('button', { name, exact: true });
    await expect(result).toHaveCount(0);
    await mkdir(bundle, { recursive: true });
    await expect(result).toBeVisible();
    await rm(path.dirname(bundle), { recursive: true });
    await expect(result).toHaveCount(0);
    // Recreate a watched directory, then modify its new inode again.
    await mkdir(bundle, { recursive: true });
    await expect(result).toBeVisible();
    await rm(bundle, { recursive: true });
    await expect(result).toHaveCount(0);
    // This root did not exist at scan time, so no watcher can report its creation.
    await app.evaluate(() => (globalThis as any).__nexlet.main.hide());
    await mkdir(path.join(later, name + '.app'), { recursive: true });
    await app.evaluate(() => (globalThis as any).__nexlet.show());
    await expect(result).toBeVisible();
    // A slow fallback check must not hold up showing the launcher.
    const shown = await app.evaluate(async () => {
      const n = (globalThis as any).__nexlet;
      const original = n.catalog.checkForChanges;
      let release!: () => void;
      n.catalog.checkForChanges = () =>
        new Promise<void>((resolve) => {
          release = resolve;
        });
      n.main.hide();
      try {
        await n.show();
        return n.main.isVisible();
      } finally {
        release?.();
        n.catalog.checkForChanges = original;
      }
    });
    expect(shown).toBe(true);
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
