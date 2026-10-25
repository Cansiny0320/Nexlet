import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
let app: ElectronApplication, main: Page, panel: Page, folder: string;
const errors: string[] = [];
const call = (page: Page, action: string, payload?: unknown) =>
  page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), {
    action,
    payload,
  });
async function open(content?: any) {
  await app.evaluate(async (_, content) => {
    const n = (globalThis as any).__nexlet;
    await n.panel.open(
      'keyboard',
      { x: 500, y: 350 },
      { target: null, ...(content ? { content } : {}) },
    );
  }, content);
  panel = app.windows().find((p) => p.url().includes('panel=1'))!;
  if (!panel) panel = await app.waitForEvent('window');
  await expect(panel.getByText('超级面板', { exact: true })).toBeVisible();
  panel.on('pageerror', (e) => errors.push(e.message));
}
async function home() {
  await app.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    n.main.show();
    n.main.webContents.send('host-change', 'navigate:launcher');
  });
  await expect(main.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await expect
    .poll(() =>
      app.evaluate(() => Object.values((globalThis as any).__nexlet.hotkeyState()).some(Boolean)),
    )
    .toBe(false);
}
async function configure(patch: any) {
  return app.evaluate((_, patch) => {
    const n = (globalThis as any).__nexlet;
    return n.panelConfig.patch({ ...patch, revision: n.panelConfig.read().revision });
  }, patch);
}
test.beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'nexlet-panel-'));
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(folder, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd()], env: env as Record<string, string> });
  main = await app.firstWindow();
  main.on('pageerror', (e) => errors.push(e.message));
  await expect(main.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await app.evaluate(({ shell }) => {
    (globalThis as any).__panelUrls = [];
    shell.openExternal = async (url) => {
      (globalThis as any).__panelUrls.push(url);
    };
  });
});
test.afterAll(async () => {
  await app?.close();
});
test('空面板保持主窗口草稿，独立收藏可排序并建立、命名、移出文件夹', async () => {
  await main.getByLabel('搜索功能、应用或快捷方式').fill('不应被清除的查询');
  await open();
  await expect(main.getByLabel('搜索功能、应用或快捷方式')).toHaveValue('不应被清除的查询');
  const pinned = (await call(main, 'state')).pinned;
  await panel.getByLabel('添加面板入口').click();
  await panel.getByLabel('搜索面板入口').fill('编码转换');
  await panel.getByRole('button', { name: '编码转换 添加', exact: true }).click();
  await panel.getByRole('button', { name: '完成添加', exact: true }).click();
  await expect(panel.getByRole('button', { name: '编码转换', exact: true })).toBeVisible();
  expect((await call(main, 'state')).pinned).toEqual(pinned);
  let config = (await call(panel, 'panel', { action: 'state' })).config;
  const a = config.items.find((i: any) => i.commandId === 'tool:json'),
    b = config.items.find((i: any) => i.commandId === 'tool:encoding');
  await panel
    .locator(`[data-panel-item="${a.id}"]`)
    .dragTo(panel.locator(`[data-panel-item="${b.id}"]`));
  await expect(panel.getByLabel('打开文件夹 文件夹')).toBeVisible();
  await panel.getByLabel('打开文件夹 文件夹').click();
  await panel.getByLabel('重命名文件夹').click();
  await panel.getByLabel('文件夹名称').fill('开发工具');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect(panel.getByLabel('重命名文件夹')).toHaveText('开发工具');
  await panel.getByLabel('管理面板入口').click();
  await panel.getByLabel('移出文件夹 JSON 工具').click();
  await panel.getByLabel('返回面板首页').click();
  await expect(panel.getByRole('button', { name: 'JSON 工具', exact: true })).toBeVisible();
  await panel.getByLabel('完成管理').click();
  await panel.getByLabel('关闭超级面板').click();
});
test('选区匹配带入 JSON，旧选区不残留，网页模板只编码一次', async () => {
  await home();
  await open({ type: 'text', text: '{"selection":42}' });
  await expect(panel.getByText('{"selection":42}', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'JSON 格式化', exact: true }).click();
  await expect(main.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"selection":42}',
  );
  await home();
  await call(main, 'webShortcut', {
    action: 'save',
    entry: {
      id: 'panel-search',
      name: '面板搜索',
      type: 'search',
      url: 'https://example.com/?q={query}',
    },
  });
  await open({ type: 'text', text: '中文 & 100%' });
  await panel.getByRole('button', { name: '面板搜索', exact: true }).click();
  expect(await app.evaluate(() => (globalThis as any).__panelUrls)).toEqual([
    'https://example.com/?q=%E4%B8%AD%E6%96%87%20%26%20100%25',
  ]);
  await home();
  await open();
  await expect(panel.getByText('当前选区', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /匹配功能/ })).toBeDisabled();
  await panel.getByLabel('关闭超级面板').click();
});
test('转主搜索保留结构化选区，时间戳预览与毫秒输入一致', async () => {
  await home();
  await open({ type: 'text', text: '{"transfer":true}' });
  await panel.getByLabel('转到主搜索').click();
  await expect(main.getByLabel('待处理输入')).toContainText('选区');
  await expect(main.getByRole('button', { name: 'JSON 格式化', exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'JSON 格式化', exact: true }).click();
  await expect(main.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"transfer":true}',
  );
  await home();
  await open({ type: 'text', text: '1735689600000' });
  await panel.getByRole('button').filter({ hasText: '打开时间戳工具' }).click();
  await expect(main.getByLabel('Unix 时间戳')).toHaveValue('1735689600000');
  await expect(main.getByLabel('时间戳单位')).toHaveValue('milliseconds');
});
test('功能快捷键选择带入选区，关闭时保留草稿；禁用匹配不可执行', async () => {
  await home();
  await call(main, 'commandConfig', {
    action: 'patch',
    id: 'tool:json',
    patch: { captureSelection: true },
  });
  await app.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    (globalThis as any).__captureOriginal = n.selection.capture;
    n.selection.capture = async () => ({
      target: null,
      content: { type: 'text', text: '{"hotkey":1}' },
    });
  });
  await app.evaluate(async () => {
    await (globalThis as any).__nexlet.activateHotkey('tool:json');
  });
  await expect(main.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"hotkey":1}',
  );
  await call(main, 'commandConfig', {
    action: 'patch',
    id: 'tool:json',
    patch: { captureSelection: false },
  });
  await main.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill('{"draft":2}');
  await expect
    .poll(() =>
      app.evaluate(() => Object.values((globalThis as any).__nexlet.hotkeyState()).some(Boolean)),
    )
    .toBe(false);
  await app.evaluate(async () => {
    await (globalThis as any).__nexlet.activateHotkey('tool:json');
  });
  await expect(main.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":2}',
  );
  await app.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    n.selection.capture = (globalThis as any).__captureOriginal;
  });
  await home();
  await open({ type: 'text', text: '{"blocked":true}' });
  await call(main, 'commandConfig', {
    action: 'patch',
    id: 'tool:json',
    patch: { disabled: true },
  });
  await panel.getByRole('button', { name: 'JSON 格式化', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('禁用');
  await call(main, 'commandConfig', {
    action: 'patch',
    id: 'tool:json',
    patch: { disabled: false },
  });
  await panel.getByLabel('关闭超级面板').click();
});
test('面板快捷键冲突回滚；分页、多屏边界与图片输入可读', async () => {
  await home();
  const before = (await call(main, 'state')).panelConfig;
  await expect(
    call(main, 'panel', {
      action: 'config',
      patch: {
        action: 'settings',
        revision: before.revision,
        patch: { shortcut: (await call(main, 'state')).settings.shortcut },
      },
    }),
  ).rejects.toThrow('重复');
  expect((await call(main, 'state')).panelConfig.shortcut).toBe(before.shortcut);
  const commands = (await call(main, 'state')).commands;
  for (const c of commands.slice(0, 18)) await configure({ action: 'add', commandId: c.id });
  await open();
  await panel.getByLabel('下一页').click();
  await expect(panel.locator('.panel-pagination')).toContainText('2 /');
  await panel.getByLabel('上一页').click();
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.from([255, 0, 0, 255]), { width: 1, height: 1 })
      .toDataURL(),
  );
  await open({ type: 'image', data: png });
  await expect(panel.getByAltText('选区图片')).toBeVisible();
  await expect(panel.getByRole('button', { name: '收进剪贴板', exact: true })).toBeVisible();
  await panel.getByLabel('清除面板选区').click();
  await expect(panel.getByAltText('选区图片')).toHaveCount(0);
  await app.evaluate(async () => {
    const n = (globalThis as any).__nexlet;
    await n.panel.open('keyboard', { x: -99999, y: 99999 }, { target: null });
  });
  const bounds = await app.evaluate(({ screen }) => {
    const w = (globalThis as any).__nexlet.panel.window;
    return { bounds: w.getBounds(), area: screen.getDisplayMatching(w.getBounds()).workArea };
  });
  expect(bounds.bounds.x).toBeGreaterThanOrEqual(bounds.area.x);
  expect(bounds.bounds.y + bounds.bounds.height).toBeLessThanOrEqual(
    bounds.area.y + bounds.area.height,
  );
  await panel.screenshot({ path: path.join(folder, 'super-panel.png') });
  expect(errors).toEqual([]);
});

test('文件和目录选区仅交给选中的插件；面板关闭后资源仍可读取', async () => {
  await call(panel, 'panel', { action: 'hide' });
  await home();
  const fixture = path.join(folder, 'selection-plugin');
  await mkdir(fixture);
  await writeFile(
    path.join(fixture, 'plugin.json'),
    JSON.stringify({
      id: 'org.nexlet.panel-fixture',
      name: '面板输入验证',
      version: '1.0.0',
      apiVersion: 1,
      description: '隔离验证',
      main: 'index.html',
      permissions: [],
      features: [
        {
          code: 'read',
          name: '读取面板选区',
          keywords: ['panel-input'],
          matches: [{ type: 'files' }, { type: 'image' }, { type: 'text' }],
        },
      ],
    }),
  );
  await writeFile(
    path.join(fixture, 'index.html'),
    '<html><body><script src="app.js"></script></body></html>',
  );
  await writeFile(path.join(fixture, 'app.js'), 'nexlet.onEnter(value=>{window.context=value;});');
  await app.evaluate(({ dialog }, fixture) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [fixture] })) as any;
  }, fixture);
  await call(main, 'pluginInstall', { development: true });
  const file = path.join(folder, 'selection.txt'),
    directory = path.join(folder, 'selection-dir');
  await writeFile(file, 'selected resource bytes');
  await mkdir(directory);
  await open({ type: 'files', paths: [file, directory] });
  await expect(panel.getByText('2 个文件 / 目录', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '读取面板选区', exact: true }).click();
  await expect(main.locator('.plugin-pill')).toContainText('面板输入验证');
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__nexlet.panel.window.isVisible()))
    .toBe(false);
  const result = await app.evaluate(async () => {
    const n = (globalThis as any).__nexlet,
      s = n.plugins.runtime.sessions.get('org.nexlet.panel-fixture');
    await s.queue;
    return {
      visible: n.panel.window.isVisible(),
      value: await s.view.webContents.executeJavaScript(
        `(async()=>({from:context.from,type:context.type,names:context.payload.map(f=>({name:f.name,directory:f.isDirectory})),text:new TextDecoder().decode(await nexlet.input.read(context.payload[0].id)),directoryDenied:await nexlet.input.read(context.payload[1].id).then(()=>false,()=>true)}))()`,
      ),
    };
  });
  expect(result).toEqual({
    visible: false,
    value: {
      from: 'selection',
      type: 'files',
      names: [
        { name: 'selection.txt', directory: false },
        { name: 'selection-dir', directory: true },
      ],
      text: 'selected resource bytes',
      directoryDenied: true,
    },
  });
  await call(main, 'window', { action: 'exitPlugin' });
});
test('悬停释放执行目标功能，空白释放保留，外部点击和 Escape 关闭', async () => {
  await home();
  await open({ type: 'text', text: '{"release":true}' });
  const button = await panel
    .getByRole('button', { name: 'JSON 格式化', exact: true })
    .boundingBox();
  await app.evaluate(
    (_, point) => {
      const p = (globalThis as any).__nexlet.panel,
        b = p.window.getBounds();
      p.release({ x: b.x + point.x, y: b.y + point.y }, false);
    },
    { x: button!.x + 20, y: button!.y + 20 },
  );
  await expect(main.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"release":true}',
  );
  await home();
  await open();
  await app.evaluate(() => {
    const p = (globalThis as any).__nexlet.panel,
      b = p.window.getBounds();
    p.release({ x: b.x + 30, y: b.y + 30 }, false);
  });
  expect(await app.evaluate(() => (globalThis as any).__nexlet.panel.window.isVisible())).toBe(
    true,
  );
  await panel.keyboard.press('Escape');
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__nexlet.panel.window.isVisible()))
    .toBe(false);
  await open();
  await app.evaluate(() => {
    const p = (globalThis as any).__nexlet.panel,
      b = p.window.getBounds();
    p.pointerDown({ x: b.x - 10, y: b.y - 10 });
  });
  expect(await app.evaluate(() => (globalThis as any).__nexlet.panel.window.isVisible())).toBe(
    false,
  );
  expect(errors).toEqual([]);
});
