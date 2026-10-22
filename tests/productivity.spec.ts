import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveClipboard, restoreClipboard } from './helpers/clipboard';

let app: ElectronApplication, page: Page, directory: string;
test.beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nexlet-productivity-'));
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
  app = await electron.launch({ args: [process.cwd()], env });
  page = await app.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await saveClipboard(app);
});
test.afterEach(async () => {
  if (app) {
    await restoreClipboard(app);
    await app.close();
  }
  await rm(directory, { recursive: true, force: true });
});
async function open(view: string, payload?: string) {
  await app.evaluate(
    (_, value) => {
      (globalThis as any).__nexlet.main.webContents.send(
        'host-change',
        'open-tool:' + JSON.stringify(value),
      );
    },
    { view, payload },
  );
  await expect(page.locator('.app-shell')).toHaveClass(new RegExp('view-' + view));
}
test('切换恢复输入、输出和选项，新输入明确替换旧草稿', async () => {
  await open('encoding');
  await page.getByLabel('工具输入', { exact: true }).fill('你好');
  await page.getByRole('button', { name: '编码', exact: true }).click();
  await expect(page.getByLabel('工具结果', { exact: true })).toHaveValue('5L2g5aW9');
  await open('clipboard');
  await open('encoding');
  await expect(page.getByLabel('工具输入', { exact: true })).toHaveValue('你好');
  await expect(page.getByLabel('工具结果', { exact: true })).toHaveValue('5L2g5aW9');
  await open('encoding', 'new');
  await expect(page.getByLabel('工具输入', { exact: true })).toHaveValue('new');
  await expect(page.getByLabel('工具结果', { exact: true })).toHaveValue('');
});
test('Base64 结果进入 JSON，返回仍保留原转换结果', async () => {
  await open('encoding', 'eyJ2YWx1ZSI6MX0=');
  await page.getByRole('button', { name: '解码', exact: true }).click();
  await page.getByRole('button', { name: '继续处理', exact: true }).click();
  await expect(page.getByLabel('待处理输入', { exact: true })).toContainText('{"value":1}');
  await page.getByRole('button', { name: 'JSON 格式化', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"value":1}',
  );
  await open('encoding');
  await expect(page.getByLabel('工具结果', { exact: true })).toHaveValue('{"value":1}');
});
test('动作菜单支持键盘、Escape 焦点恢复和输入法保护', async () => {
  const search = page.locator('.launcher-input');
  await search.fill('JSON');
  await expect(page.getByRole('button', { name: 'JSON 工具', exact: true })).toBeVisible();
  await search.dispatchEvent('keydown', { key: 'k', metaKey: true, isComposing: true });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await search.press('ControlOrMeta+k');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '打开', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: '取消固定', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('JSON');
});
test('快捷短语保存、变量预览与稳定指令入口', async () => {
  await open('snippets');
  await page.getByLabel('短语名称', { exact: true }).fill('问候');
  await page.getByLabel('分组', { exact: true }).fill('常用');
  await page.getByLabel('短语内容', { exact: true }).fill('你好，{{input:姓名}}！');
  await page.getByRole('button', { name: '预览变量', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('姓名');
  await page.getByLabel('变量：姓名', { exact: true }).fill('小陈');
  await page.getByRole('button', { name: '预览变量', exact: true }).click();
  await expect(page.getByLabel('短语预览', { exact: true })).toHaveValue('你好，小陈！');
  await page.getByRole('button', { name: '保存短语', exact: true }).click();
  await expect(page.locator('.productivity-list')).toContainText('问候');
  const state = await page.evaluate(() => window.nexlet.call('state'));
  expect(state.commands.find((command) => command.name === '问候')?.id).toMatch(/^snippet:/);
  await open('clipboard');
  await open('snippets');
  await expect(page.getByLabel('短语预览', { exact: true })).toHaveValue('你好，小陈！');
});
test('配置差异按类别导入、快捷短语即时更新与撤销', async () => {
  await open('settings');
  await page.getByText('编辑并预览导入', { exact: true }).click();
  await page
    .getByLabel('JSONC 配置', { exact: true })
    .fill(
      '{ // test\n"version":1,"categories":{"settings":{"theme":"dark"},"snippets":[{"id":"imported","name":"导入的短语","body":"hello","group":""}]}}',
    );
  await page.getByRole('button', { name: '预览差异', exact: true }).click();
  await expect(page.locator('.profile-diff')).toHaveCount(2);
  await page.getByRole('button', { name: '应用选中类别', exact: true }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.nexlet.call('state'))).settings.theme)
    .toBe('dark');
  expect(
    (await page.evaluate(() => window.nexlet.call('state'))).commands.some(
      (item) => item.id === 'snippet:imported',
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '撤销上次导入', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.nexlet.call('state'))).settings.theme)
    .toBe('system');
  expect(
    (await page.evaluate(() => window.nexlet.call('state'))).commands.some(
      (item) => item.id === 'snippet:imported',
    ),
  ).toBe(false);
});
test('HTML 历史保留格式与纯文本复制，继续处理携带 HTML', async () => {
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    const host = (globalThis as any).__nexlet;
    host.clips.stop();
    await clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob(['A\tB'], { type: 'text/plain' }),
        'text/html': new Blob(['<table><tr><td>A</td><td>B</td></tr></table>'], {
          type: 'text/html',
        }),
      }),
    ]);
    await host.clips.capture(true);
  });
  const index = await page.evaluate(() => window.nexlet.call('clipIndex'));
  expect(index.ids).toHaveLength(1);
  const summary = await page.evaluate(
    async ({ id, revision }) =>
      (await window.nexlet.call('clipPage', { ids: [id], revision })).items[0],
    { id: index.ids[0], revision: index.revision },
  );
  expect(summary.hasHtml).toBe(true);
  expect(summary).not.toHaveProperty('html');
  await page.evaluate(
    (id) => window.nexlet.call('clipAction', { action: 'copy', ids: [id] }),
    index.ids[0],
  );
  const rich = await app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read();
    const item = items.find((item) => item.types.includes('text/html'));
    return item ? ((await item.getType('text/html')) as Blob).text() : '';
  });
  expect(rich).toContain('<table>');
  await page.evaluate(
    (id) => window.nexlet.call('clipAction', { action: 'copyPlain', ids: [id] }),
    index.ids[0],
  );
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('A\tB');
  await page.evaluate(
    (id) => window.nexlet.call('clipAction', { action: 'continue', ids: [id] }),
    index.ids[0],
  );
  await expect(page.getByLabel('待处理输入', { exact: true })).toContainText('A');
});
test('工作区整体运行、单项运行和失败重试不重复成功项', async () => {
  await app.evaluate(() => {
    const host = (globalThis as any).__nexlet;
    host.__runs = [];
    host.__fail = true;
    host.workspaces.execute = async (item: { id: string }) => {
      host.__runs.push(item.id);
      if (item.id === 'b' && host.__fail) throw Error('fixture failure');
    };
  });
  await page.evaluate(() =>
    window.nexlet.call('productivity', {
      action: 'save',
      value: {
        version: 1,
        revision: 0,
        snippets: [],
        workspaces: [
          {
            id: 'test',
            name: '测试环境',
            items: [
              { id: 'a', kind: 'url', target: 'https://example.com/a' },
              { id: 'b', kind: 'url', target: 'https://example.com/b' },
            ],
          },
        ],
      },
    }),
  );
  await open('workspaces', JSON.stringify({ id: 'test' }));
  await page.getByRole('button', { name: '运行工作区', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试失败项', exact: true })).toBeVisible();
  expect(await app.evaluate(() => (globalThis as any).__nexlet.__runs)).toEqual(['a', 'b']);
  await app.evaluate(() => {
    (globalThis as any).__nexlet.__fail = false;
  });
  await page.getByRole('button', { name: '重试失败项', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试失败项', exact: true })).toHaveCount(0);
  expect(await app.evaluate(() => (globalThis as any).__nexlet.__runs)).toEqual(['a', 'b', 'b']);
  await page.getByRole('button', { name: '单独运行', exact: true }).first().click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__nexlet.__runs))
    .toEqual(['a', 'b', 'b', 'a']);
});
test('跨重启恢复是显式选项，清除草稿后不再恢复', async () => {
  await page.evaluate(() => window.nexlet.call('settings', { restoreToolSessions: true }));
  await open('encoding', 'persisted');
  await page.getByRole('button', { name: '编码', exact: true }).click();
  await open('clipboard');
  await restoreClipboard(app);
  await app.close();
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
  app = await electron.launch({ args: [process.cwd()], env });
  page = await app.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await saveClipboard(app);
  await open('encoding');
  await expect(page.getByLabel('工具输入', { exact: true })).toHaveValue('persisted');
  await expect(page.getByLabel('工具结果', { exact: true })).toHaveValue('cGVyc2lzdGVk');
  await page.evaluate(() => window.nexlet.call('toolDraft', { action: 'clear' }));
  await expect(page.locator('.launcher-input')).toBeVisible();
  await open('encoding');
  await expect(page.getByLabel('工具输入', { exact: true })).toHaveValue('');
});
test('文件预览真实读取、键盘切换、过期响应和文件动作', async () => {
  const textPath = path.join(directory, 'report.md'),
    imagePath = path.join(directory, 'picture.png');
  await writeFile(textPath, '# 项目笔记\n<script>never execute</script>');
  await copyFile(path.resolve('docs/screenshots/filesearch.png'), imagePath);
  await app.evaluate(
    (_, items) => {
      const files = (globalThis as any).__nexlet.files;
      const result = {
        status: 'ready',
        message: 'fixture',
        limited: false,
        items: items.map((item) => ({
          ...item,
          size: 100,
          modified: '',
          directory: false,
        })),
      };
      files.spotlight.search = async () => result;
      files.linux.search = async () => result;
      files.platform = 'darwin';
      files.status = async () => ({ status: 'ready', message: 'fixture' });
    },
    [textPath, imagePath].map((file) => ({
      path: file,
      name: path.basename(file),
      parent: path.dirname(file),
    })),
  );
  await open('filesearch');
  await expect(page.getByRole('option')).toHaveCount(2);
  await expect(page.getByLabel('文件预览').locator('pre')).toHaveText(
    '# 项目笔记\n<script>never execute</script>',
  );
  expect(await page.getByLabel('文件预览').locator('script').count()).toBe(0);
  await page.locator('.file-search-bar input').press('ArrowDown');
  await expect(page.getByLabel('文件预览').locator('img')).toHaveAttribute('alt', 'picture.png');
  await app.evaluate(() => {
    const files = (globalThis as any).__nexlet.files,
      info = files.info.bind(files);
    files.info = async (owner: number, file: string) => {
      if (file.endsWith('report.md')) await new Promise((resolve) => setTimeout(resolve, 350));
      return info(owner, file);
    };
  });
  await page.getByRole('option').filter({ hasText: 'report.md' }).click();
  await page.waitForTimeout(120);
  await page.getByRole('option').filter({ hasText: 'picture.png' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByLabel('文件预览').locator('img')).toHaveAttribute('alt', 'picture.png');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: '继续处理', exact: true }).click();
  await expect(page.getByLabel('待处理输入', { exact: true })).toContainText('picture.png');
});
test('快捷短语独立窗口隔离与三语浅深色布局', async () => {
  await open('snippets');
  await page.getByLabel('短语名称', { exact: true }).fill('发布说明');
  await page.getByLabel('短语内容', { exact: true }).fill('日期：{{date}}\n负责人：{{input:姓名}}');
  const opening = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const detached = await opening;
  await expect(detached.getByLabel('短语名称', { exact: true })).toHaveValue('发布说明');
  await detached.getByLabel('短语名称', { exact: true }).fill('独立窗口草稿');
  await open('snippets');
  await expect(page.getByLabel('短语名称', { exact: true })).toHaveValue('发布说明');
  const shots = path.resolve('docs/validation/productivity-2026-10-22');
  await mkdir(shots, { recursive: true });
  for (const language of ['zh-CN', 'zh-Hant', 'en'] as const)
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => window.nexlet.call('settings', value), { language, theme });
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: path.join(shots, `snippets-${language}-${theme}.png`) });
    }
  await app.evaluate(() => {
    const main = (globalThis as any).__nexlet.main;
    main.setMinimumSize(620, 540);
    main.setSize(620, 600);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(shots, 'snippets-en-narrow.png') });
});
