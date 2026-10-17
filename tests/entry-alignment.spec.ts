import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, mkdir, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
let app: ElectronApplication, page: Page, folder: string;
const errors: string[] = [];
async function call(action: string, payload?: unknown, target = page) {
  return target.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), {
    action,
    payload,
  });
}
async function home() {
  await call('window', { action: 'exitPlugin' });
  await app.evaluate(() => (globalThis as any).__nexlet.main.show());
  const input = page.getByLabel('搜索功能、应用或快捷方式');
  if (!(await input.isVisible()))
    await app.evaluate(() =>
      (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:launcher'),
    );
  await expect(input).toBeVisible();
  await input.fill('');
  await expect
    .poll(() =>
      app.evaluate(() => Object.values((globalThis as any).__nexlet.hotkeyState()).some(Boolean)),
    )
    .toBe(false);
}
async function open(name: string) {
  await home();
  await page.getByLabel('搜索功能、应用或快捷方式').fill(name);
  await page.getByRole('button', { name, exact: true }).first().click();
}
async function hotkey(id: string) {
  return app.evaluate(async (_, id) => await (globalThis as any).__nexlet.activateHotkey(id), id);
}
async function pluginJS(script: string) {
  return app.evaluate(async (_, script) => {
    const active = (globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.entry');
    await active.queue;
    return active.view.webContents.executeJavaScript(script);
  }, script);
}
async function external() {
  return app.evaluate(() => (globalThis as any).__entryExternal as string[]);
}
async function pathOpens() {
  return app.evaluate(() => (globalThis as any).__entryPaths as string[]);
}

test.beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'nexlet-entry-'));
  const fixture = path.join(folder, 'plugin');
  await mkdir(fixture);
  await writeFile(
    path.join(fixture, 'plugin.json'),
    JSON.stringify({
      id: 'org.nexlet.entry',
      name: '入口测试插件',
      version: '1.0.0',
      apiVersion: 1,
      description: '隔离测试',
      main: 'index.html',
      permissions: [],
      features: [
        {
          code: 'one',
          name: '入口测试一',
          keywords: ['entryone'],
          matches: [{ type: 'files', extensions: ['txt'] }],
        },
        { code: 'two', name: '入口测试二', keywords: ['entrytwo'] },
      ],
    }),
  );
  await writeFile(
    path.join(fixture, 'index.html'),
    '<html><body><input id="draft"><script src="app.js"></script></body></html>',
  );
  await writeFile(
    path.join(fixture, 'app.js'),
    `window.events=[];nexlet.onReady(()=>events.push('ready'));nexlet.onEnter(v=>{events.push('enter:'+v.code);window.context=v;});nexlet.onDetach(()=>events.push('detach'));nexlet.onOut(()=>events.push('out'));nexlet.onActivate(v=>events.push('activate:'+v.code));`,
  );
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(folder, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd()], env });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await app.evaluate(({ dialog, shell }, fixture) => {
    (globalThis as any).__entryExternal = [];
    (globalThis as any).__entryPaths = [];
    shell.openExternal = async (url) => {
      (globalThis as any).__entryExternal.push(url);
    };
    shell.openPath = async (target) => {
      (globalThis as any).__entryPaths.push(target);
      return '';
    };
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [fixture] })) as any;
  }, fixture);
  await call('pluginInstall', { development: true });
});
test.afterAll(async () => {
  await app?.close();
});

test('别名可检索；逐功能禁用拦截旧结果并能在管理页恢复', async () => {
  await home();
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).click({ button: 'right' });
  await page.getByRole('button', { name: '别名与快捷键', exact: true }).click();
  await page.getByLabel('功能别名').fill('结构化数据\n我的 JSON');
  await page.getByLabel('功能快捷键', { exact: true }).fill('Control+Alt+J');
  await page.getByRole('button', { name: '保存功能设置' }).click();
  await page.getByLabel('搜索功能、应用或快捷方式').fill('jghsj');
  await expect(page.getByRole('button', { name: 'JSON 工具', exact: true })).toBeVisible();
  const stale = await call('search', { query: '结构化数据' });
  const command = stale.results.find((c: any) => c.id === 'tool:json');
  await call('commandConfig', { action: 'patch', id: 'tool:json', patch: { disabled: true } });
  await expect(call('launch', { id: command.id, inputId: command.inputId })).rejects.toThrow(
    '禁用',
  );
  const matched = await call('search', { query: '{"a":1}' });
  expect(matched.matches.some((c: any) => c.id === 'match:json')).toBe(false);
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByLabel('筛选功能').fill('结构化数据');
  await page.locator('.command-management-row').filter({ hasText: 'JSON 工具' }).click();
  await page.getByRole('switch', { name: '禁用此功能', exact: true }).uncheck();
  await page.getByRole('button', { name: '保存功能设置' }).click();
  const state = await call('state');
  expect(state.shortcutStatuses['tool:json'].effective).toBe('Control+Alt+J');
  expect(state.commandConfig.commands['tool:json'].aliases).toContain('结构化数据');
});

test('功能热键保留主窗口 JSON 草稿并优先聚焦已有独立窗口', async () => {
  await open('JSON 工具');
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill('{"draft":"保持内容"}');
  await hotkey('tool:json');
  await expect(page.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":"保持内容"}',
  );
  const pending = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const popup = await pending;
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await expect(popup.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":"保持内容"}',
  );
  const count = app.windows().length;
  await hotkey('tool:json');
  expect(app.windows().length).toBe(count);
  await expect(popup.getByRole('textbox', { name: 'JSON 输入', exact: true })).toHaveText(
    '{"draft":"保持内容"}',
  );
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await popup.getByRole('button', { name: '关闭窗口', exact: true }).click();
});

test('插件热键聚焦时不重新 enter、不撤销原文件输入，分离后继续保留实例', async () => {
  await home();
  const file = path.join(folder, 'input.txt');
  await writeFile(file, 'resource retained');
  const input = await call('launchInput', { type: 'files', paths: [file], from: 'drop' });
  await call('launch', { id: 'plugin:org.nexlet.entry:one', inputId: input.id });
  await pluginJS(
    "document.querySelector('#draft').value='插件草稿';window.token=context.payload[0].id",
  );
  const first = await app.evaluate(
    () =>
      (globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.entry').view.webContents
        .id,
  );
  await hotkey('plugin:org.nexlet.entry:one');
  expect(await pluginJS('events')).toEqual(['ready', 'enter:one']);
  expect(await pluginJS('nexlet.input.read(token).then(b=>new TextDecoder().decode(b))')).toBe(
    'resource retained',
  );
  const pending = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const popup = await pending;
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await hotkey('plugin:org.nexlet.entry:one');
  expect(await pluginJS("document.querySelector('#draft').value")).toBe('插件草稿');
  expect(await pluginJS('events')).toEqual(['ready', 'enter:one', 'detach']);
  expect(
    await app.evaluate(
      () =>
        (globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.entry').view
          .webContents.id,
    ),
  ).toBe(first);
  await popup.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await home();
  await page.getByLabel('搜索功能、应用或快捷方式').fill('不应带入插件的旧搜索');
  await hotkey('plugin:org.nexlet.entry:one');
  expect(await pluginJS('context.payload')).toBe('');
  expect(await pluginJS('context.type')).toBe('text');
  await home();
  await call('commandConfig', {
    action: 'patch',
    id: 'plugin:org.nexlet.entry:one',
    patch: { disabled: true },
  });
  const disabled = await call('state');
  expect(disabled.commands.some((c: any) => c.id === 'plugin:org.nexlet.entry:one')).toBe(false);
  expect(disabled.commands.some((c: any) => c.id === 'plugin:org.nexlet.entry:two')).toBe(true);
  await expect(hotkey('plugin:org.nexlet.entry:one')).rejects.toThrow('禁用');
  await call('commandConfig', {
    action: 'patch',
    id: 'plugin:org.nexlet.entry:one',
    patch: { disabled: false },
  });
  await call('commandConfig', {
    action: 'patch',
    id: 'plugin:org.nexlet.entry:one',
    patch: { shortcut: 'Control+Alt+P' },
  });
  await call('pluginToggle', { id: 'org.nexlet.entry', enabled: false });
  expect((await call('state')).shortcutStatuses['plugin:org.nexlet.entry:one'].inactive).toContain(
    '不可用',
  );
  await expect(hotkey('plugin:org.nexlet.entry:one')).rejects.toThrow('不存在');
  await call('pluginToggle', { id: 'org.nexlet.entry', enabled: true });
});

test('固定与最近不重复，固定排序和最近单项移除；列表选中 ID 保持', async () => {
  await home();
  await call('launch', { id: 'tool:json' });
  await home();
  await expect(page.locator('[data-command-id="tool:json"]')).toHaveCount(1);
  const before = (await call('state')).pinned;
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).click({ button: 'right' });
  await page.getByRole('button', { name: '固定项前移' }).click();
  const after = (await call('state')).pinned;
  expect(after.indexOf('tool:json')).toBe(before.indexOf('tool:json') - 1);
  // Isolate the keyboard layout transition from native cursor events on the shared desktop.
  await page.getByRole('button', { name: 'JSON 工具', exact: true }).hover();
  await page.mouse.move(5, 5);
  await expect(page.locator('.tool-tile.selected')).toHaveAttribute('data-command-id', 'tool:json');
  const keyboardOnly = await page.addStyleTag({
    content: '[data-command-id]{pointer-events:none!important}',
  });
  await page.getByRole('button', { name: '列表展示' }).focus();
  await page.getByRole('button', { name: '列表展示' }).press('Enter');
  await expect(page.locator('.tool-row.selected')).toHaveAttribute('data-command-id', 'tool:json');
  await keyboardOnly.evaluate((style) => style.parentNode?.removeChild(style));
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__nexlet.main.getBounds().height))
    .toBeGreaterThan(550);
  await page.screenshot({ path: path.join(folder, 'launcher-list.png') });
  await call('launch', { id: 'tool:encoding' });
  await home();
  await page.getByRole('button', { name: '编码转换', exact: true }).click({ button: 'right' });
  await page.getByRole('button', { name: '从最近使用移除' }).click();
  expect((await call('state')).recent).not.toContain('tool:encoding');
  await page.getByRole('button', { name: '网格展示' }).click();
});

test('中文输入法确认和重复 Enter 不执行功能，普通 Enter 可正常打开', async () => {
  await home();
  await page.getByLabel('搜索功能、应用或快捷方式').fill('编码转换');
  await expect(page.getByRole('button', { name: '编码转换', exact: true })).toBeVisible();
  await page.getByLabel('搜索功能、应用或快捷方式').evaluate((input) => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }),
    );
  });
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await page.getByLabel('搜索功能、应用或快捷方式').press('Enter');
  await expect(page.getByLabel('工具输入')).toBeVisible();
});

test('本地文件和目录按 ID 管理，路径编辑不改变固定及别名', async () => {
  await open('设置');
  const localFile = path.join(folder, 'local.txt');
  await writeFile(localFile, 'local');
  await page.getByRole('button', { name: '添加本地启动项' }).click();
  await page.getByLabel('本地项名称').fill('我的本地文件');
  await page.getByLabel('本地项路径').fill(localFile);
  await page.getByRole('button', { name: '保存本地项' }).click();
  let state = await call('state');
  const id = state.commandConfig.localEntries[0].id;
  await call('commandConfig', {
    action: 'patch',
    id: 'local:' + id,
    patch: { aliases: ['我的资料'] },
  });
  await call('commandConfig', { action: 'pin', id: 'local:' + id });
  await call('launch', { id: 'local:' + id });
  expect(await pathOpens()).toContain(localFile);
  await call('commandConfig', { action: 'localSave', id, name: '我的本地目录', path: folder });
  state = await call('state');
  expect(state.commandConfig.localEntries[0].id).toBe(id);
  expect(state.pinned).toContain('local:' + id);
  expect((await call('search', '我的资料'))[0].path).toBe(folder);
  await call('launch', { id: 'local:' + id });
  expect(await pathOpens()).toContain(folder);
  await call('commandConfig', { action: 'localSave', id, name: '已移动的文件', path: localFile });
  await unlink(localFile);
  await expect(call('launch', { id: 'local:' + id })).rejects.toThrow('不存在');
  await call('commandConfig', { action: 'localRemove', id });
  await expect(call('launch', { id: 'local:' + id })).rejects.toThrow('不存在');
});

test('网页搜索模板正确编码，旧网址仍可用，热键空查询提示输入且不执行其他功能', async () => {
  await open('网页快开');
  await page.getByLabel('网页类型').selectOption('search');
  await page.getByLabel('网站名称').fill('百科');
  await page.getByLabel('网站地址').fill('https://example.com/search?q={query}');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  const entry = (await call('state')).settings.webShortcuts.find((w: any) => w.name === '百科');
  expect(entry.type).toBe('search');
  await home();
  await page.getByLabel('搜索功能、应用或快捷方式').fill('百科 中文 & 100%');
  await page.getByRole('button', { name: '百科', exact: true }).click();
  expect((await external()).at(-1)).toBe(
    'https://example.com/search?q=%E4%B8%AD%E6%96%87%20%26%20100%25',
  );
  await home();
  const before = (await external()).length;
  expect(await hotkey('web:' + entry.id)).toMatchObject({ needsQuery: '百科' });
  await expect(page.getByLabel('网页搜索', { exact: true })).toBeVisible();
  await hotkey('tool:encoding');
  await expect(page.getByLabel('网页搜索', { exact: true })).toBeVisible();
  expect((await external()).length).toBe(before);
  await page.getByLabel('网页搜索', { exact: true }).fill('再试一次');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect.poll(async () => (await external()).length).toBe(before + 1);
  await call('settings', {
    webShortcuts: [entry, { id: 'legacy', name: '旧网站', url: 'https://example.org/a%20b' }],
  });
  await call('launch', { id: 'web:legacy' });
  expect((await external()).at(-1)).toBe('https://example.org/a%20b');
  await call('webShortcut', { action: 'save', entry: { ...entry, name: '新百科' } });
  expect((await call('state')).settings.webShortcuts).toHaveLength(2);
  await call('webShortcut', { action: 'remove', id: entry.id });
  await expect(call('launch', { id: 'web:' + entry.id, payload: 'old' })).rejects.toThrow('不存在');
});

test('唤起键冲突保存失败保留旧设置，持久配置能重新读回且无 renderer 异常', async () => {
  await call('commandConfig', {
    action: 'patch',
    id: 'tool:json',
    patch: { aliases: ['结构化数据'] },
  });
  const before = (await call('state')).settings.shortcut;
  await app.evaluate(() => {
    const manager = (globalThis as any).__nexlet.shortcuts;
    (globalThis as any).__entryRegister = manager.backend.register;
    manager.backend.register = () => false;
  });
  await expect(call('settings', { shortcut: 'Control+Alt+F11' })).rejects.toThrow('占用');
  expect((await call('state')).settings.shortcut).toBe(before);
  await app.evaluate(() => {
    (globalThis as any).__nexlet.shortcuts.backend.register = (globalThis as any).__entryRegister;
  });
  await home();
  await page.reload();
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  expect((await call('state')).commandConfig.commands['tool:json'].aliases).toContain('结构化数据');
  expect(errors).toEqual([]);
});

test('工具交接期间的热键直接忽略，完成后不补执行', async () => {
  await open('编码转换');
  await page.getByLabel('工具输入').fill('交接中的草稿');
  await app.evaluate(() => {
    const handoff = (globalThis as any).__nexlet.toolHandoffs;
    (globalThis as any).__entryAck = handoff.acknowledge;
    handoff.acknowledge = function (...args: any[]) {
      (globalThis as any).__entryPendingAck = () => {
        (globalThis as any).__entryAck.apply(this, args);
      };
    };
  });
  const pending = app.waitForEvent('window');
  await page.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const popup = await pending;
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as any).__entryPendingAck)))
    .toBe(true);
  await hotkey('tool:uuid');
  await app.evaluate(() => {
    const handoff = (globalThis as any).__nexlet.toolHandoffs;
    handoff.acknowledge = (globalThis as any).__entryAck;
    (globalThis as any).__entryPendingAck();
  });
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await expect(popup.getByLabel('工具输入')).toHaveValue('交接中的草稿');
  await popup.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
});
