import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

test.skip(process.platform !== 'win32', 'Windows Everything integration');
let app: ElectronApplication, page: Page, folder: string, scope: string;
const errors: string[] = [];
async function call(action: string, payload?: unknown) {
  return page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), {
    action,
    payload,
  });
}
async function open() {
  await app.evaluate(() => {
    (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:filesearch');
  });
  await expect(page.getByLabel('Everything 文件搜索')).toBeVisible();
}
async function home() {
  await app.evaluate(() => {
    (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:launcher');
  });
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir('.tmp/filesearch-verification', { recursive: true });
  folder = await mkdtemp(path.resolve('.tmp', 'filesearch-prepare-'));
  scope = path.join(folder, 'scope');
  await mkdir(scope);
  await writeFile(path.join(scope, 'prepare-fixture.txt'), 'fixture');
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
});
test.afterEach(async () => {
  await app?.close();
  expect(errors).toEqual([]);
});

test('empty open starts real indexing, reopens reuse it, transient IPC failure does not replace it', async () => {
  await open();
  await expect(page.getByLabel('Everything 文件搜索')).toHaveValue('');
  await expect(page.locator('.file-search-footer')).toContainText('索引已就绪', { timeout: 30000 });
  const processInfo = await app.evaluate(() => {
    const e = (globalThis as any).__nexlet.files.engine;
    return { pid: e.child?.pid, binary: e.engine };
  });
  expect(processInfo.pid).toBeGreaterThan(0);
  const before = await stat(processInfo.binary);
  await page.getByLabel('Everything 文件搜索').fill('prepare-fixture');
  await expect(page.getByRole('option')).toContainText('prepare-fixture.txt');
  await home();
  await open();
  await expect(page.locator('.file-search-footer')).toContainText('索引已就绪');
  await app.evaluate(() => {
    const e = (globalThis as any).__nexlet.files.engine;
    e.version = async () => null;
  });
  expect(await call('fileSearchStatus')).toMatchObject({ status: 'ready' });
  expect(await app.evaluate(() => (globalThis as any).__nexlet.files.engine.child?.pid)).toBe(
    processInfo.pid,
  );
  expect((await stat(processInfo.binary)).mtimeMs).toBe(before.mtimeMs);
  await page.screenshot({ path: '.tmp/filesearch-verification/filesearch-prepared.png' });
});

test('preparation icon stays mounted during polls, typing and clearing; only latest query runs when ready', async () => {
  await app.evaluate(() => {
    const g = globalThis as any,
      n = g.__nexlet;
    g.__phase = 'preparing';
    g.__checks = 0;
    g.__queries = [];
    const startedAt = Date.now() - 12000;
    n.files.status = async () => {
      g.__checks++;
      await new Promise((r) => setTimeout(r, 300));
      return {
        status: g.__phase,
        message: '正在准备文件索引，首次扫描可能需要几分钟。',
        startedAt,
        scopes: ['C:\\fixture'],
        version: '1.4.1.1032',
      };
    };
    n.files.search = async (_owner: number, query: string) => {
      g.__queries.push(query);
      return {
        status: query ? 'ready' : 'idle',
        message: query ? '' : '输入文件名或路径开始搜索，例如 ext:pdf 项目',
        items: query
          ? [
              {
                path: 'C:\\fixture\\' + query + '.txt',
                name: query + '.txt',
                parent: 'C:\\fixture',
                size: 1,
                modified: '',
                directory: false,
              },
            ]
          : [],
        limited: false,
      };
    };
  });
  await open();
  const status = page.getByRole('status', { name: '文件索引准备中' }),
    input = page.getByLabel('Everything 文件搜索');
  await expect(status).toContainText(/已等待 1[2-9] 秒/);
  const icon = await status.locator('svg').elementHandle();
  await input.fill('old');
  await input.fill('');
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__checks))
    .toBeGreaterThanOrEqual(3);
  expect(await icon!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(status).toContainText(/已等待 1[6-9] 秒/);
  expect(await app.evaluate(() => (globalThis as any).__queries.filter(Boolean))).toEqual([]);
  await page.screenshot({ path: '.tmp/filesearch-verification/filesearch-preparing.png' });
  await home();
  await open();
  await expect(status).toBeVisible();
  await expect(status).toContainText(/已等待 1[6-9] 秒/);
  await input.fill('latest');
  await app.evaluate(() => {
    (globalThis as any).__phase = 'ready';
  });
  await expect(page.getByRole('option')).toContainText('latest.txt');
  expect(await app.evaluate(() => (globalThis as any).__queries.filter(Boolean))).toEqual([
    'latest',
  ]);
});

test('unavailable state retries even with blank input and ignores a late search after clearing', async () => {
  await app.evaluate(() => {
    const g = globalThis as any,
      n = g.__nexlet;
    let checks = 0;
    n.files.status = async () => ({
      status: ++checks === 1 ? 'unavailable' : 'ready',
      message: '内置搜索引擎连接已中断，请点击重试重新连接。',
      startedAt: Date.now(),
    });
    const original = n.files.search.bind(n.files);
    n.files.search = (_owner: number, query: string) =>
      query === 'slow'
        ? new Promise((_resolve, reject) => {
            g.__lateSearch = reject;
          })
        : original(_owner, query);
  });
  await open();
  await expect(page.getByText('内置搜索引擎连接已中断，请点击重试重新连接。')).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.file-search-footer')).toContainText('索引已就绪');
  await page.getByLabel('Everything 文件搜索').fill('slow');
  await expect
    .poll(() => app.evaluate(() => typeof (globalThis as any).__lateSearch))
    .toBe('function');
  await page.getByLabel('Everything 文件搜索').fill('');
  await expect(page.getByText('输入文件名或路径开始搜索，例如 ext:pdf 项目')).toBeVisible();
  await app.evaluate(() => {
    (globalThis as any).__lateSearch(new Error('stale query'));
  });
  await expect(page.getByText('stale query')).toHaveCount(0);
  await expect(page.getByRole('option')).toHaveCount(0);
});
