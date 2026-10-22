import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let application: ElectronApplication, directory: string;
test.beforeEach(async ({}, testInfo) => {
  directory = await mkdtemp(path.join(tmpdir(), 'nexlet-clipboard-layout-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [process.cwd()], env });
  const page = await application.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await page.evaluate(() =>
    window.nexlet.call('settings', { clipboardEnabled: false, hideOnBlur: false }),
  );
  await application.evaluate(
    async ({ nativeImage }, height) => {
      const n = (globalThis as any).__nexlet;
      const image = nativeImage.createFromBitmap(Buffer.alloc(208 * height * 4, 180), {
        width: 208,
        height,
      });
      const captured = await n.clips.images.capture(
        new Uint8Array(image.toPNG()),
        n.clipStore.images,
      );
      const now = Date.now();
      for (const item of [
        { id: 'picture', kind: 'image', ...captured },
        { id: 'file-one', kind: 'files', files: ['C:/fixture/first.png'] },
        { id: 'file-two', kind: 'files', files: ['C:/fixture/second.png'] },
        { id: 'text', kind: 'text', text: 'Clipboard layout regression' },
      ]) {
        await n.clipStore.addClip({
          text: '',
          ...item,
          hash: item.id,
          createdAt: now,
          favorite: false,
        });
      }
    },
    testInfo.title.includes('small image') ? 131 : 320,
  );
  // Use distinct timestamps to keep the image ahead of the neighboring file rows.
  await application.evaluate(async () => {
    const n = (globalThis as any).__nexlet;
    for (const id of ['text', 'file-two', 'file-one', 'picture'])
      await n.clipStore.touchClips([id]);
  });
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  await expect(page.locator('.clip-item')).toHaveCount(4);
});

test('expanding a small image without changing its height keeps following rows below it', async () => {
  const page = await application.firstWindow();
  const picture = page.locator('[data-clip-id="picture"]');
  await expect(picture.locator('img')).toHaveJSProperty('naturalHeight', 131);
  await expectContiguousRows();
  for (const name of ['展开', '收起', '展开']) {
    await picture.getByRole('button', { name, exact: true }).click();
    await expectContiguousRows();
  }
});
test.afterEach(async () => {
  await application?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function expectContiguousRows() {
  const page = await application.firstWindow();
  await expect
    .poll(() =>
      page.locator('.clip-item').evaluateAll((rows) => {
        const bounds = rows.map((row) => row.getBoundingClientRect());
        return bounds.slice(1).map((box, index) => Math.round(box.top - bounds[index].bottom));
      }),
    )
    .toEqual([0, 0, 0]);
}

test('resizing preserves measured heights for expanded images and unchanged file rows', async () => {
  const page = await application.firstWindow();
  const picture = page.locator('[data-clip-id="picture"]');
  await picture.getByRole('button', { name: '展开', exact: true }).click();
  await expect(picture.locator('img')).toHaveJSProperty('naturalHeight', 320);
  await expectContiguousRows();
  const before = await picture.boundingBox();
  for (const width of [1000, 850, 1050]) {
    await application.evaluate(({ BrowserWindow }, width) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.isVisible())!;
      main.setSize(width, 760);
    }, width);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expectContiguousRows();
    expect((await picture.boundingBox())!.height).toBe(before!.height);
  }
  await page.screenshot({ path: 'test-results/clipboard-layout-expanded.png' });
  await picture.getByRole('button', { name: '收起', exact: true }).click();
  await expectContiguousRows();
  expect((await picture.boundingBox())!.height).toBeLessThan(before!.height);
});
