import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

test.skip(process.platform !== 'win32', 'Windows Everything integration');
let app: ElectronApplication, page: Page, folder: string, scope: string, root: string;
const errors: string[] = [];
const row = (name: string) =>
  page.getByRole('option').filter({
    has: page.locator('strong', {
      hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
    }),
  });
async function call(action: string, payload?: unknown) {
  return page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), {
    action,
    payload,
  });
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir('.tmp/filesearch-verification', { recursive: true });
  folder = await mkdtemp(path.resolve('.tmp', 'filesearch-browser-'));
  scope = path.join(folder, 'scope');
  root = path.join(scope, 'browser-fixture');
  await mkdir(path.join(root, 'child'), { recursive: true });
  await mkdir(path.join(root, 'empty'));
  await Promise.all(
    [
      'report.pdf',
      'picture.png',
      'song.mp3',
      'video.mp4',
      'archive.zip',
      'code.ts',
      'app.exe',
      'unknown.xyz',
    ].map((name) => writeFile(path.join(root, name), 'fixture')),
  );
  await writeFile(path.join(root, 'child', 'nested.txt'), 'nested');
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(folder, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd()], env });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await call('settings', { fileSearchPaths: [scope], clipboardEnabled: false, theme: 'light' });
  await app.evaluate(() => {
    (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:filesearch');
  });
  await expect(page.locator('.file-search-footer')).toContainText('索引已就绪', { timeout: 30000 });
  await page.getByLabel('Everything 文件搜索').fill('browser-fixture');
  await expect(row('browser-fixture')).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  expect(errors).toEqual([]);
});

test('click previews metadata, double click browses and file icons differ; navigation preserves search', async () => {
  const details = page.getByLabel('文件信息');
  await row('browser-fixture').click();
  await expect(details).toContainText(root);
  await expect(details).toContainText('创建时间');
  await row('browser-fixture').dblclick();
  await expect(page.getByLabel('筛选当前文件夹')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(10);
  await expect(row('nested.txt')).toHaveCount(0);
  for (const [file, kind] of [
    ['report.pdf', 'document'],
    ['picture.png', 'image'],
    ['song.mp3', 'audio'],
    ['video.mp4', 'video'],
    ['archive.zip', 'archive'],
    ['code.ts', 'code'],
    ['app.exe', 'app'],
    ['unknown.xyz', 'unknown'],
    ['child', 'folder'],
  ])
    await expect(row(file).locator('[data-file-kind]')).toHaveAttribute('data-file-kind', kind);
  await row('report.pdf').click();
  await expect(details).toContainText('7 B');
  await expect(details).toContainText(path.join(root, 'report.pdf'));
  await page.screenshot({ path: '.tmp/filesearch-verification/file-browser.png' });
  await page.getByLabel('筛选当前文件夹').fill('REPORT');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(row('report.pdf')).toBeVisible();
  await page.getByLabel('筛选当前文件夹').fill('no-such-name');
  await expect(page.getByText('当前文件夹没有匹配项')).toBeVisible();
  await page.getByLabel('筛选当前文件夹').fill('');
  await row('child').dblclick();
  await expect(row('nested.txt')).toBeVisible();
  await page.getByRole('button', { name: '上一级', exact: true }).click();
  await expect(row('report.pdf')).toBeVisible();
  await row('empty').click();
  await row('empty').press('Enter');
  await expect(page.getByText('此文件夹为空')).toBeVisible();
  await page.getByRole('button', { name: '返回搜索', exact: true }).click();
  await expect(page.getByLabel('Everything 文件搜索')).toHaveValue('browser-fixture');
  await expect(row('browser-fixture')).toHaveAttribute('aria-selected', 'true');
});

test('files use default open, explicit Explorer action works, deleted metadata reports an error', async () => {
  await row('browser-fixture').dblclick();
  await expect(row('report.pdf')).toBeVisible();
  await app.evaluate(({ shell }) => {
    const g = globalThis as any;
    g.__opened = [];
    g.__revealed = [];
    shell.openPath = async (file: string) => {
      g.__opened.push(file);
      return '';
    };
    shell.showItemInFolder = (file: string) => {
      g.__revealed.push(file);
    };
  });
  await row('report.pdf').dblclick();
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__opened))
    .toEqual([path.join(root, 'report.pdf')]);
  await page.getByRole('button', { name: '在资源管理器中打开', exact: true }).click();
  expect(await app.evaluate(() => (globalThis as any).__revealed)).toEqual([
    path.join(root, 'report.pdf'),
  ]);
  await row('child').click();
  await page.getByRole('button', { name: '在资源管理器中打开', exact: true }).click();
  expect(await app.evaluate(() => (globalThis as any).__opened)).toContain(
    path.join(root, 'child'),
  );
  await rm(path.join(root, 'report.pdf'));
  await row('report.pdf').click();
  await expect(page.getByLabel('文件信息')).toContainText('已移动、删除或不存在');
});

test('large folders load more, stale details cannot overwrite the latest selection, access errors can return', async () => {
  await Promise.all(
    Array.from({ length: 205 }, (_, i) => writeFile(path.join(root, `entry-${i}.txt`), '')),
  );
  await row('browser-fixture').dblclick();
  await expect(page.getByRole('option')).toHaveCount(100);
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(200);
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(215);
  await app.evaluate(() => {
    const g = globalThis as any,
      f = g.__nexlet.files,
      original = f.info.bind(f);
    f.info = async (owner: number, file: string) => {
      const result = await original(owner, file);
      if (file.endsWith('report.pdf'))
        await new Promise((resolve) => {
          g.__finishInfo = resolve;
        });
      return result;
    };
  });
  await row('report.pdf').click();
  await expect
    .poll(() => app.evaluate(() => typeof (globalThis as any).__finishInfo))
    .toBe('function');
  await row('picture.png').click();
  await expect(page.getByLabel('文件信息')).toContainText(path.join(root, 'picture.png'));
  await app.evaluate(() => {
    (globalThis as any).__finishInfo();
  });
  await expect(page.getByLabel('文件信息').locator('h3')).toHaveText('picture.png');
  await app.evaluate(() => {
    (globalThis as any).__nexlet.files.browse = async () => {
      throw new Error('没有权限访问此文件或文件夹');
    };
  });
  await row('child').dblclick();
  await expect(page.getByText('没有权限访问此文件或文件夹')).toBeVisible();
  await page.getByRole('button', { name: '返回搜索', exact: true }).click();
  await expect(page.getByLabel('Everything 文件搜索')).toHaveValue('browser-fixture');
});

test('detached window restores a folder reached after paging and its selected metadata', async () => {
  await Promise.all(
    Array.from({ length: 205 }, (_, i) => writeFile(path.join(root, `entry-${i}.txt`), '')),
  );
  const late = path.join(root, 'zz-late-child');
  await mkdir(late);
  await writeFile(path.join(late, 'restored.txt'), 'restore');
  await page.getByLabel('Everything 文件搜索').fill('folder: exact:browser-fixture');
  await expect(page.getByRole('option')).toHaveCount(1);
  await row('browser-fixture').dblclick();
  await expect(page.getByRole('option')).toHaveCount(100);
  while (!(await row('zz-late-child').count())) {
    const count = await page.getByRole('option').count();
    await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await expect.poll(() => page.getByRole('option').count()).toBeGreaterThan(count);
  }
  await row('zz-late-child').dblclick();
  await row('restored.txt').click();
  await expect(page.getByLabel('文件信息')).toContainText(path.join(late, 'restored.txt'));
  const opening = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const popup = await opening;
  popup.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await expect(popup.getByLabel('筛选当前文件夹')).toBeVisible();
  await expect(popup.getByRole('option')).toContainText('restored.txt');
  await expect(popup.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  await expect(popup.getByLabel('文件信息')).toContainText(path.join(late, 'restored.txt'));
  await popup.getByRole('button', { name: '返回搜索', exact: true }).click();
  await expect(popup.getByLabel('Everything 文件搜索')).toHaveValue(
    'folder: exact:browser-fixture',
  );
});
