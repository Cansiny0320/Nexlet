import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let application: ElectronApplication;
test.beforeEach(async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_TEST_LOCALE: 'zh-CN',
    NEXLET_USER_DATA: await mkdtemp(path.join(tmpdir(), 'nexlet-interactions-')),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [process.cwd()], env });
  await expect((await application.firstWindow()).locator('.launcher-input')).toBeVisible();
  await expect
    .poll(() => application.evaluate(() => (globalThis as any).__nexlet.catalog.loading))
    .toBe(false);
});
test.afterEach(async () => {
  await application?.close();
});

test('普通结果不等待正则最终响应或图标，旧查询的延迟响应不能覆盖新查询', async () => {
  const page = await application.firstWindow();
  await application.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    n.catalog.items = [
      {
        id: 'app:fast',
        name: 'Fast App',
        kind: 'app',
        subtitle: 'fixture',
        keywords: [],
        path: '/fixture.app',
      },
      { id: 'app:next', name: 'Next App', kind: 'app', subtitle: 'fixture', keywords: [] },
    ];
    n.store.set('plugins', [
      {
        enabled: true,
        directory: '/fixture',
        manifest: {
          id: 'org.nexlet.test',
          name: 'fixture',
          version: '1.0.0',
          main: 'index.html',
          features: [
            {
              code: 'regex',
              name: 'Regex Handler',
              keywords: [],
              matches: [{ type: 'regex', pattern: '^Fast' }],
            },
          ],
        },
      },
    ]);
    const original = n.matcher.search.bind(n.matcher);
    n.matcher.search = async (...args: any[]) => {
      const result = await original(...args);
      if (args[3] === 'Fast')
        await new Promise((resolve) => {
          (globalThis as any).__releaseSearch = resolve;
        });
      return result;
    };
    const icons = n.catalog.withIcons.bind(n.catalog);
    n.catalog.withIcons = async (items: any[]) => {
      if (items.some((item) => item.id === 'app:fast'))
        await new Promise((resolve) => {
          (globalThis as any).__releaseIcons = resolve;
        });
      return icons(items);
    };
    n.main.webContents.send('host-change', 'state');
  });
  await page.locator('.launcher-input').fill('Fast');
  await expect(page.locator('[data-command-id="app:fast"]')).toBeVisible();
  await expect
    .poll(() => application.evaluate(() => typeof (globalThis as any).__releaseSearch))
    .toBe('function');
  await expect
    .poll(() => application.evaluate(() => typeof (globalThis as any).__releaseIcons))
    .toBe('function');
  await expect(page.locator('[data-command-id="plugin:org.nexlet.test:regex"]')).toHaveCount(0);
  await page.locator('.launcher-input').fill('Next');
  await expect(page.locator('[data-command-id="app:next"]')).toBeVisible();
  await application.evaluate(() => {
    (globalThis as any).__releaseSearch();
    (globalThis as any).__releaseIcons();
  });
  await expect(page.locator('[data-command-id="app:fast"]')).toHaveCount(0);
  await expect(page.locator('[data-command-id="app:next"]')).toBeVisible();
});

test('搜索只读取一份命令配置，不触发完整状态和自启动查询', async () => {
  const page = await application.firstWindow();
  await application.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    n.catalog.items = Array.from({ length: 1000 }, (_, i) => ({
      id: 'app:' + i,
      name: 'Fixture ' + i,
      kind: 'app',
      subtitle: 'fixture',
      keywords: [],
    }));
    const read = n.store.get.bind(n.store);
    (globalThis as any).__configReads = 0;
    n.store.get = (key: string, fallback: unknown) => {
      if (key === 'command-config') (globalThis as any).__configReads++;
      return read(key, fallback);
    };
    n.shortcuts.apply = () => {
      throw Error('search must not synchronize shortcuts');
    };
  });
  const result = await page.evaluate(() =>
    window.nexlet.call('search', { query: 'Fixture', from: 'input' }),
  );
  expect(result.results).toHaveLength(60);
  expect(await application.evaluate(() => (globalThis as any).__configReads)).toBeLessThan(10);
});

test('剪贴板虚拟滚动、跨页多选、全文展开与独立窗口恢复', async () => {
  const page = await application.firstWindow();
  await application.evaluate(({ clipboard }) => {
    const n = (globalThis as any).__nexlet;
    clipboard.writeText = async (text: string) => {
      (globalThis as any).__copied = text;
    };
    for (let i = 0; i < 200; i++)
      n.store.addClip({
        id: 'clip-' + i,
        hash: 'clip-' + i,
        kind: 'text',
        text: ('record-' + i + ' ').padEnd(4096, 'x') + ' tail-only-' + i,
        createdAt: Date.now() + i,
        favorite: false,
      });
  });
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  await expect(page.locator('[data-clip-id="clip-199"]')).toBeVisible();
  expect(await page.locator('.clip-item').count()).toBeLessThan(40);
  await page.locator('[data-clip-id="clip-199"]').click();
  await page.locator('.clipboard-list').evaluate((node) => {
    node.scrollTop = node.scrollHeight / 2;
  });
  await expect
    .poll(
      async () =>
        await page
          .locator('.clip-item')
          .evaluateAll((nodes) =>
            nodes.some((node) => Number(node.getAttribute('data-clip-id')?.split('-')[1]) < 120),
          ),
    )
    .toBe(true);
  const target = await page.locator('.clip-item').evaluateAll((nodes) => {
    const list = document.querySelector('.clipboard-list')!.getBoundingClientRect();
    return nodes
      .find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top >= list.top && rect.bottom <= list.bottom;
      })!
      .getAttribute('data-clip-id')!;
  });
  const targetNumber = Number(target.split('-')[1]);
  await page.locator(`[data-clip-id="${target}"]`).click({ modifiers: ['Shift'] });
  await expect(page.locator('.selection-status')).toContainText(`已选择 ${200 - targetNumber} 项`);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  const copied = await application.evaluate(() => (globalThis as any).__copied as string);
  expect(copied.startsWith('record-199 ')).toBe(true);
  expect(copied.endsWith('tail-only-' + targetNumber)).toBe(true);
  await page.getByLabel('搜索剪贴板').fill('tail-only-0');
  const row = page.locator('[data-clip-id="clip-0"]');
  await expect(row).toBeVisible();
  await expect(page.locator('.clip-item')).toHaveCount(1);
  await row.getByRole('button', { name: '展开', exact: true }).click();
  await expect(row).toContainText('tail-only-0');
  await expect(page.getByRole('button', { name: '打开独立剪贴板' })).toBeEnabled();
  const popupPromise = application.waitForEvent('window');
  await page.getByRole('button', { name: '打开独立剪贴板' }).click();
  const popup = await popupPromise;
  await expect(popup.getByLabel('搜索剪贴板')).toHaveValue('tail-only-0');
  await expect(popup.locator('[data-clip-id="clip-0"]')).toHaveAttribute('aria-selected', 'true');
  await expect(popup.locator('.clip-text.expanded')).toContainText('tail-only-0');
  await expect(page.locator('.launcher-input')).toBeVisible();
  await popup.screenshot({ path: 'test-results/clipboard-paged-detached.png' });
  await popup.close();
});

test('浏览历史时收到新记录保留当前可见位置，不跳回旧选中项', async () => {
  const page = await application.firstWindow();
  await application.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    for (let i = 0; i < 200; i++)
      n.store.addClip({
        id: 'scroll-' + i,
        hash: 'scroll-' + i,
        kind: 'text',
        text: 'scroll record ' + i,
        createdAt: Date.now() + i,
        favorite: false,
      });
  });
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  await expect(page.locator('[data-clip-id="scroll-199"]')).toBeVisible();
  await page.locator('.clipboard-list').evaluate((node) => {
    node.scrollTop = 9000;
  });
  await expect
    .poll(() =>
      page
        .locator('.clip-item')
        .evaluateAll((nodes) =>
          nodes.some((node) => Number(node.getAttribute('data-clip-id')?.split('-')[1]) < 130),
        ),
    )
    .toBe(true);
  await expect(page.locator('.clip-placeholder')).toHaveCount(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const anchor = await page.locator('.clip-item').evaluateAll((nodes) => {
    const top = document.querySelector('.clipboard-list')!.getBoundingClientRect().top;
    const node = nodes.find((node) => node.getBoundingClientRect().top >= top)!;
    return { id: node.getAttribute('data-clip-id'), top: node.getBoundingClientRect().top };
  });
  await application.evaluate(() => {
    const n = (globalThis as any).__nexlet,
      original = n.store.clipPage.bind(n.store);
    (globalThis as any).__pageRefreshes = 0;
    n.store.clipPage = (...args: any[]) => {
      (globalThis as any).__pageRefreshes++;
      return original(...args);
    };
    n.store.addClip({
      id: 'newest',
      hash: 'newest',
      kind: 'text',
      text: 'new history',
      createdAt: Date.now() + 1000,
      favorite: false,
    });
    n.main.webContents.send('host-change', 'clips');
  });
  await expect
    .poll(() => application.evaluate(() => (globalThis as any).__pageRefreshes))
    .toBeGreaterThan(0);
  await expect(page.locator('.clip-placeholder')).toHaveCount(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.locator('.clipboard-list').evaluate((node) => node.scrollTop)).toBeGreaterThan(
    8000,
  );
  await expect(page.locator(`[data-clip-id="${anchor.id}"]`)).toBeAttached();
  expect(
    Math.abs(
      (await page
        .locator(`[data-clip-id="${anchor.id}"]`)
        .evaluate((node) => node.getBoundingClientRect().top)) - anchor.top,
    ),
  ).toBeLessThan(2);
});

test('图片异步加载及展开收起后重新测量行高，不覆盖相邻记录', async () => {
  const page = await application.firstWindow();
  const imagePath = await application.evaluate(
    () => ((globalThis as any).__nexlet.store.images as string) + '/' + 'a'.repeat(64) + '.png',
  );
  await copyFile(path.join(process.cwd(), 'assets/icon.png'), imagePath);
  await application.evaluate(({ nativeImage }, imagePath) => {
    const n = (globalThis as any).__nexlet,
      image = nativeImage.createFromPath(imagePath),
      size = image.getSize();
    for (let i = 0; i < 20; i++)
      n.store.addClip({
        id: 'image-text-' + i,
        hash: 'image-text-' + i,
        kind: 'text',
        text: 'following record ' + i,
        createdAt: Date.now() + i,
        favorite: false,
      });
    n.store.addClip({
      id: 'image',
      hash: 'image',
      kind: 'image',
      text: 'image',
      imagePath,
      thumbnail: image.resize({ width: 100 }).toDataURL(),
      width: size.width,
      height: size.height,
      createdAt: Date.now() + 100,
      favorite: false,
    });
  }, imagePath);
  await page.getByRole('button', { name: '剪贴板', exact: true }).first().click();
  const row = page.locator('[data-clip-id="image"]'),
    following = page.locator('[data-clip-id="image-text-19"]');
  await expect(row).toBeVisible();
  await expect
    .poll(() =>
      row
        .locator('img')
        .evaluate(
          (node) =>
            (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalHeight > 0,
        ),
    )
    .toBe(true);
  const collapsed = await row.evaluate((node) => node.getBoundingClientRect().height);
  await row.getByRole('button', { name: '展开', exact: true }).click();
  await expect
    .poll(() => row.evaluate((node) => node.getBoundingClientRect().height))
    .toBeGreaterThan(collapsed + 100);
  await expect
    .poll(async () =>
      Math.abs(
        (await following.evaluate((node) => node.getBoundingClientRect().top)) -
          (await row.evaluate((node) => node.getBoundingClientRect().bottom)),
      ),
    )
    .toBeLessThan(2);
  await row.getByRole('button', { name: '收起', exact: true }).click();
  await expect
    .poll(() => row.evaluate((node) => node.getBoundingClientRect().height))
    .toBe(collapsed);
  await expect
    .poll(async () =>
      Math.abs(
        (await following.evaluate((node) => node.getBoundingClientRect().top)) -
          (await row.evaluate((node) => node.getBoundingClientRect().bottom)),
      ),
    )
    .toBeLessThan(2);
});
