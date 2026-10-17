import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

let app: ElectronApplication, page: Page, folder: string, data: string;
const root = process.cwd();
const errors: string[] = [];
async function start() {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' })).toBeVisible();
  await app.evaluate(async () => {
    await (globalThis as any).__nexlet.store.set('settings', {
      ...(globalThis as any).__nexlet.store.settings(),
      theme: 'light',
    });
  });
}
async function call(action: string, payload?: unknown) {
  return page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), {
    action,
    payload,
  });
}
async function home() {
  await app.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    n.main.show();
    n.main.focus();
    n.main.webContents.send('host-change', 'navigate:launcher');
  });
  await expect(page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' })).toBeVisible();
}
async function open(name: string) {
  await home();
  await page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' }).fill(name);
  await page.getByRole('button', { name, exact: true }).first().click();
}
async function launchPlugin() {
  await call('launch', { id: 'plugin:org.nexlet.hello:note' });
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((p) => p.url().startsWith('nexlet-plugin://org.nexlet.hello/')),
    )
    .toBe(true);
  return app
    .context()
    .pages()
    .find((p) => p.url().startsWith('nexlet-plugin://org.nexlet.hello/'))!;
}
async function saveClipboard() {
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    const items = await clipboard.read();
    const saved = [];
    for (const item of items) {
      const values: Record<string, any> = {};
      for (const type of item.types) {
        if (
          [
            'text/plain',
            'text/html',
            'image/png',
            'text/rtf',
            'electron application/bookmark',
          ].includes(type)
        )
          values[type] = await item.getType(type);
      }
      if (Object.keys(values).length) saved.push(new ClipboardItem(values));
    }
    (globalThis as any).__savedClipboard = saved;
    (globalThis as any).__savedFiles = await (globalThis as any).__nexlet.platform.readFiles();
  });
}
async function restoreClipboard() {
  await app.evaluate(async ({ clipboard }) => {
    const saved = (globalThis as any).__savedClipboard,
      files = (globalThis as any).__savedFiles;
    if (files?.length) await (globalThis as any).__nexlet.platform.writeFiles(files);
    else if (saved?.length) await clipboard.write(saved);
  });
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  folder = await mkdtemp(path.join(root, '.tmp', 'e2e-'));
  data = path.join(folder, 'data');
  await start();
  await saveClipboard();
});
test.afterAll(async () => {
  if (app) {
    try {
      await restoreClipboard();
    } finally {
      await app.close();
    }
  }
});

test('启动器、快捷方式检索与真实启动', async () => {
  await expect.poll(() => call('state').then((s: any) => s.catalogLoading)).toBe(false);
  const state: any = await call('state');
  expect(state.commands.some((c: any) => c.kind === 'shortcut')).toBeTruthy();
  expect(state.nativeStatus).toBeNull();
  await page.screenshot({ path: path.join(root, 'test-results', 'launcher.png') });
  await page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' }).fill('jsgz');
  await expect(page.locator('.tool-tile').filter({ hasText: '计算稿纸' })).toBeVisible();
  const shortcuts = path.join(folder, 'shortcuts');
  await mkdir(shortcuts);
  const fixture = path.join(folder, 'editor.cjs'),
    received = path.join(folder, 'received.txt'),
    ready = path.join(folder, 'ready');
  await writeFile(
    fixture,
    `const {app,BrowserWindow}=require('electron');const fs=require('fs');app.setPath('userData',${JSON.stringify(path.join(folder, 'editor-data'))});app.whenReady().then(async()=>{const w=new BrowserWindow({width:500,height:300,title:'Nexlet 回贴测试编辑器'});await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<title>Nexlet 回贴测试编辑器</title><textarea autofocus aria-label="test" style="width:95%;height:90%"></textarea>'));w.show();w.focus();await w.webContents.executeJavaScript('document.querySelector("textarea").focus()');setTimeout(()=>fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,handle:w.getNativeWindowHandle().readBigUInt64LE().toString()})),500);const timer=setInterval(async()=>{if(w.isDestroyed()){clearInterval(timer);return;}const t=await w.webContents.executeJavaScript('document.querySelector("textarea").value');if(t){fs.writeFileSync(${JSON.stringify(received)},t);clearInterval(timer);w.close();}},100);setTimeout(()=>app.quit(),60000);});app.on('window-all-closed',()=>app.quit());`,
  );
  const shortcut = path.join(shortcuts, 'Nexlet 回贴验证.lnk');
  const customIcon = path.join(root, 'assets', 'icon.ico');
  expect(
    await app.evaluate(
      ({ shell }, args) =>
        shell.writeShortcutLink(args.shortcut, 'create', {
          target: process.execPath,
          args: `"${args.fixture}"`,
          description: 'Nexlet isolated test editor',
          icon: args.customIcon,
          iconIndex: 0,
        }),
      { shortcut, fixture, customIcon },
    ),
  ).toBeTruthy();
  await call('settings', { searchPaths: [shortcuts] });
  await expect.poll(() => call('state').then((s: any) => s.catalogLoading)).toBe(false);
  await home();
  await page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' }).fill('回贴验证');
  await expect(page.locator('.tool-tile').filter({ hasText: 'Nexlet 回贴验证' })).toBeVisible();
  const expectedIcon = await app.evaluate(
    ({ nativeImage }, file) => nativeImage.createFromPath(file).toDataURL(),
    customIcon,
  );
  await expect(
    page.locator('.tool-tile').filter({ hasText: 'Nexlet 回贴验证' }).locator('img'),
  ).toHaveAttribute('src', expectedIcon);
  await page.screenshot({ path: path.join(root, 'test-results', 'search.png') });
  await page.locator('.tool-tile').filter({ hasText: 'Nexlet 回贴验证' }).click();
  await expect.poll(() => readFile(ready, 'utf8').catch(() => ''), { timeout: 15000 }).not.toBe('');
  const editor = JSON.parse(await readFile(ready, 'utf8'));
  if (process.env.NEXLET_NATIVE_PASTE !== '1') {
    await home();
    return;
  }
  // Native paste testing requires the test editor to own desktop focus; never send input elsewhere.
  await expect
    .poll(
      () =>
        app.evaluate(async () => {
          const n = (globalThis as any).__nexlet;
          await n.platform.rememberTarget();
          return n.platform.target?.pid;
        }),
      { timeout: 45000 },
    )
    .toBe(editor.pid);
  const target = await app.evaluate(async () => {
    const n = (globalThis as any).__nexlet;
    await n.show();
    return n.platform.target;
  });
  expect(target.pid).toBe(editor.pid);
  expect(((await call('state')) as any).canPaste).toBeTruthy();
  const text = 'Nexlet 外部回贴验证 128 × 3 = 384';
  await call('clipAction', { action: 'writeText', text });
  await call('clipAction', { action: 'capture' });
  const clips: any = await call('clips');
  expect(clips[0].text).toBe(text);
  await call('clipAction', { action: 'paste', ids: [clips[0].id] });
  await expect.poll(() => readFile(received, 'utf8').catch(() => '')).toBe(text);
  await home();
});

test('计算稿纸续算、备注、锁定与恢复', async () => {
  await open('计算稿纸');
  await page.getByRole('button', { name: '新稿纸', exact: true }).click();
  const first = page.getByRole('textbox', { name: '第 1 行计算公式' });
  await first.fill('128*3');
  await expect(page.locator('output').first()).toHaveText('384');
  await first.press('Enter');
  const second = page.getByRole('textbox', { name: '第 2 行计算公式' });
  await expect(second).toHaveValue('384');
  await second.fill('384+256');
  await expect(page.locator('output').nth(1)).toHaveText('640');
  await second.press('Control+b');
  await page.getByRole('textbox', { name: '为当前计算添加备注' }).fill('后续费用');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.calc-note')).toHaveText('后续费用');
  await page.getByRole('button', { name: '修改稿纸名称', exact: true }).click();
  await page.getByRole('textbox', { name: '修改稿纸名称' }).fill('Nexlet 验证稿纸');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.save-indicator')).toHaveText('已保存');
  await page.screenshot({ path: path.join(root, 'test-results', 'scratchpad.png') });
  await page.getByRole('button', { name: '锁定稿纸（禁止编辑）', exact: true }).click();
  await expect(first).toBeDisabled();
  await expect(page.locator('.save-indicator')).toHaveText('已保存');
  await home();
  await open('计算稿纸');
  await expect(first).toHaveValue('128*3');
  await expect(first).toBeDisabled();
  await page.getByRole('button', { name: '解锁稿纸', exact: true }).click();
});

test('剪贴板文本、图片、文件、收藏、多选和中转', async () => {
  for (const text of ['Nexlet 测试文本 A', 'Nexlet 测试文本 B']) {
    await call('clipAction', { action: 'writeText', text });
    await call('clipAction', { action: 'capture' });
  }
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const n = (globalThis as any).__nexlet;
    const buffer = Buffer.alloc(80 * 40 * 4, 255);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 234;
      buffer[i + 1] = 134;
      buffer[i + 2] = 85;
    }
    const png = nativeImage.createFromBitmap(buffer, { width: 80, height: 40 }).toPNG();
    await clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) }),
    ]);
    await n.clips.capture(true);
  });
  const sample = path.join(folder, 'Nexlet 测试文件.txt');
  await writeFile(sample, 'Nexlet test');
  await app.evaluate(async (_, file) => {
    const n = (globalThis as any).__nexlet;
    await n.platform.writeFiles([file]);
    await n.clips.capture(true);
  }, sample);
  const clips: any = await call('clips');
  expect(new Set(clips.map((i: any) => i.kind))).toEqual(new Set(['text', 'image', 'files']));
  const file = clips.find((i: any) => i.kind === 'files');
  await call('clipAction', { action: 'copy', ids: [file.id] });
  expect(
    await app.evaluate(async () => await (globalThis as any).__nexlet.platform.readFiles()),
  ).toEqual([sample]);
  const selected = clips.filter((i: any) => i.text.includes('测试文本')).map((i: any) => i.id);
  await call('clipAction', { action: 'copy', ids: selected });
  expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(
    'Nexlet 测试文本 B\nNexlet 测试文本 A',
  );
  await call('clipAction', { action: 'favorite', ids: [selected[0]], value: true });
  await open('剪贴板');
  await expect(page.locator('.clip-item')).toHaveCount(clips.length);
  await page.screenshot({ path: path.join(root, 'test-results', 'clipboard.png') });
  await page.getByRole('textbox', { name: '搜索剪贴板' }).fill('测试文本 A');
  await expect(page.locator('.clip-item')).toHaveCount(1);
  await page.getByRole('textbox', { name: '搜索剪贴板' }).fill('');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.locator('.clip-item')).toHaveCount(1);
  const popupPromise = app.waitForEvent('window');
  await page.getByRole('button', { name: '悬浮中转', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator('.clip-item')).toHaveCount(1);
  await popup.close();
  await call('clipAction', { action: 'writeText', text: '重新捕获已删除内容' });
  await call('clipAction', { action: 'capture' });
  const again: any = await call('clips', { query: '重新捕获已删除内容' });
  await call('clipAction', { action: 'delete', ids: [again[0].id] });
  await call('clipAction', { action: 'capture' });
  expect(await call('clips', { query: '重新捕获已删除内容' })).toHaveLength(1);
});

test('附加工具正常输入、错误输入与深色主题', async () => {
  await open('JSON 工具');
  await page
    .getByRole('textbox', { name: 'JSON 输入', exact: true })
    .fill('{"answer":42,"items":[{"name":"Nexlet"}],"big":9007199254740993}');
  await expect(page.getByLabel('JSON 解析结果')).toContainText('9007199254740993');
  await page.screenshot({ path: path.join(root, 'test-results', 'json-format.png') });
  await page.getByRole('button', { name: '全部折叠', exact: true }).click();
  await expect(page.getByLabel('JSON 解析结果')).not.toContainText('9007199254740993');
  await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill('{oops');
  await expect(page.locator('.has-error')).toBeVisible();
  await page.getByRole('tab', { name: 'JSON 对比', exact: true }).click();
  await page
    .getByRole('textbox', { name: '原始 JSON', exact: true })
    .fill('{"name":"old","deleted":true}');
  await page
    .getByRole('textbox', { name: '修改后的 JSON', exact: true })
    .fill('{"name":"new","added":true}');
  await page.getByRole('button', { name: '开始对比', exact: true }).click();
  await expect(page.locator('.cm-deletedLine').first()).toBeVisible();
  await expect(page.locator('.cm-insertedLine').first()).toBeVisible();
  await page.screenshot({ path: path.join(root, 'test-results', 'json-diff.png') });
  await open('编码转换');
  await page.getByRole('textbox', { name: '工具输入' }).fill('Nexlet 你好');
  await page.getByRole('button', { name: '编码', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '工具结果' })).toHaveValue(
    Buffer.from('Nexlet 你好').toString('base64'),
  );
  await page.getByRole('textbox', { name: '工具输入' }).fill('!!!');
  await page.getByRole('button', { name: '解码', exact: true }).click();
  await expect(page.locator('.has-error')).toBeVisible();
  await open('时间戳');
  await page.getByRole('textbox', { name: 'Unix 时间戳' }).fill('0');
  await expect(page.locator('output').nth(1)).toHaveText('1970-01-01T00:00:00.000Z');
  await page.getByRole('textbox', { name: 'Unix 时间戳' }).fill('invalid');
  await expect(page.locator('output').first()).toHaveText('请输入有效时间戳');
  await open('UUID');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  expect(await page.getByRole('textbox', { name: '生成的 UUID' }).inputValue()).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  await open('设置');
  await page.getByRole('combobox', { name: '主题', exact: true }).click();
  await page.getByRole('option', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: path.join(root, 'test-results', 'settings-dark.png') });
  await page.getByRole('combobox', { name: '主题', exact: true }).click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
});

test('真实插件安装、独立存储、权限拒绝、禁用和卸载', async () => {
  await home();
  await app.evaluate(
    ({ dialog }, directory) => {
      (globalThis as any).__dialogOriginals = [dialog.showOpenDialog, dialog.showMessageBox];
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [directory] })) as any;
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any;
    },
    path.join(root, 'examples', 'hello-nexlet'),
  );
  try {
    expect(await call('pluginInstall', { development: true })).toBeTruthy();
  } finally {
    await app.evaluate(({ dialog }) => {
      [dialog.showOpenDialog, dialog.showMessageBox] = (globalThis as any).__dialogOriginals;
    });
  }
  let plugin = await launchPlugin();
  await expect(plugin.getByRole('textbox', { name: '便笺内容' })).toBeVisible();
  await plugin.getByRole('textbox', { name: '便笺内容' }).fill('插件数据持久保存');
  await expect(plugin.locator('#status')).toHaveText('已保存');
  expect(
    await plugin.evaluate(() => ({
      node: typeof (window as any).require,
      process: typeof (window as any).process,
    })),
  ).toEqual({ node: 'undefined', process: 'undefined' });
  const denial = await plugin.evaluate(async () => {
    try {
      await (window as any).nexlet.clipboard.readText();
      return '';
    } catch (e) {
      return String(e);
    }
  });
  expect(denial).toContain('未授权：clipboard.read');
  const network = await plugin.evaluate(async () => {
    try {
      await fetch('https://example.com');
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  expect(network).toBe('blocked');
  await plugin.getByRole('button', { name: '复制便笺' }).click();
  await expect(plugin.locator('#status')).toHaveText('已复制');
  expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(
    '插件数据持久保存',
  );
  await plugin.screenshot({ path: path.join(root, 'test-results', 'plugin.png') });
  await call('window', { action: 'exitPlugin' });
  await home();
  plugin = await launchPlugin();
  await expect(plugin.getByRole('textbox', { name: '便笺内容' })).toHaveValue('插件数据持久保存');
  await call('pluginToggle', { id: 'org.nexlet.hello', enabled: false });
  await expect
    .poll(() =>
      call('state').then((s: any) => s.commands.some((c: any) => c.id.startsWith('plugin:'))),
    )
    .toBe(false);
  await call('pluginToggle', { id: 'org.nexlet.hello', enabled: true });
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(root, 'examples', 'hello-nexlet'));
  const manifest = JSON.parse(zip.readAsText('plugin.json'));
  manifest.version = '1.0.1';
  zip.updateFile('plugin.json', Buffer.from(JSON.stringify(manifest)));
  const archive = path.join(folder, 'hello.nexlet');
  zip.writeZip(archive);
  await app.evaluate(({ dialog }, archive) => {
    (globalThis as any).__dialogOriginals = [dialog.showOpenDialog, dialog.showMessageBox];
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [archive] })) as any;
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any;
  }, archive);
  try {
    expect(await call('pluginInstall', { development: false })).toBeTruthy();
  } finally {
    await app.evaluate(({ dialog }) => {
      [dialog.showOpenDialog, dialog.showMessageBox] = (globalThis as any).__dialogOriginals;
    });
  }
  expect(((await call('pluginInspect')) as any[])[0].manifest.version).toBe('1.0.1');
  plugin = await launchPlugin();
  await expect(plugin.getByRole('textbox', { name: '便笺内容' })).toHaveValue('插件数据持久保存');
  await call('pluginRemove', { id: 'org.nexlet.hello', deleteData: false });
  expect(await call('pluginInspect')).toEqual([]);
});

test('重启后稿纸、收藏与设置保留，界面无脚本异常', async () => {
  await restoreClipboard();
  await app.close();
  await start();
  await saveClipboard();
  const pads: any = await call('pads');
  expect(pads.find((p: any) => p.name === 'Nexlet 验证稿纸').lines[1].expression).toBe('384+256');
  expect((await call('clips', { kind: 'favorite' })) as any[]).toHaveLength(1);
  expect(((await call('state')) as any).settings.searchPaths[0]).toContain('shortcuts');
  expect(errors).toEqual([]);
});

test('文件搜索空输入准备索引，索引后自动重试，清空后忽略过期错误', async () => {
  const scope = path.join(folder, 'empty-index');
  await mkdir(scope);
  await call('settings', { fileSearchPaths: [scope] });
  await open('文件搜索');
  const input = page.getByRole('textbox', { name: 'Everything 文件搜索' });
  await expect(
    page.getByText('输入文件名或路径开始搜索，例如 ext:pdf 项目', { exact: true }),
  ).toBeVisible();
  expect(
    await app.evaluate(() => (globalThis as any).__nexlet.files.engine.child?.pid),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(root, 'test-results', 'filesearch-idle.png') });
  await app.evaluate(() => {
    const n = (globalThis as any).__nexlet;
    (globalThis as any).__fileStatusOriginal = n.files.status;
    (globalThis as any).__fileSearchOriginal = n.files.search;
    let tries = 0,
      checks = 0;
    n.files.status = async () =>
      tries === 1 && checks++ === 0
        ? {
            status: 'preparing',
            message: '正在建立文件索引，完成后会自动显示搜索结果。',
            startedAt: Date.now(),
          }
        : (globalThis as any).__fileStatusOriginal.call(n.files);
    n.files.search = async (owner: number, query: string) => {
      if (query === 'slow')
        return new Promise((_resolve, reject) => {
          (globalThis as any).__lateFileError = reject;
        });
      if (query === 'building')
        return ++tries === 1
          ? {
              status: 'indexing',
              message: '正在建立文件索引，完成后会自动显示搜索结果。',
              items: [],
              limited: false,
            }
          : {
              status: 'ready',
              message: '',
              items: [
                {
                  path: 'C:\\fixture\\ready.txt',
                  name: 'ready.txt',
                  parent: 'C:\\fixture',
                  size: 1,
                  modified: '',
                  directory: false,
                },
              ],
              limited: false,
            };
      return (globalThis as any).__fileSearchOriginal.call(n.files, owner, query);
    };
  });
  try {
    await input.fill('building');
    await expect(
      page.getByText('正在建立文件索引，完成后会自动显示搜索结果。', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: 'ready.txt' })).toBeVisible({
      timeout: 7000,
    });
    await input.fill('slow');
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as any).__lateFileError))
      .toBe('function');
    await input.fill('');
    await expect(
      page.getByText('输入文件名或路径开始搜索，例如 ext:pdf 项目', { exact: true }),
    ).toBeVisible();
    await app.evaluate(() => {
      (globalThis as any).__lateFileError(new Error('过期的查询失败'));
    });
    await expect(page.getByText('过期的查询失败', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('option')).toHaveCount(0);
  } finally {
    await app.evaluate(() => {
      (globalThis as any).__nexlet.files.search = (globalThis as any).__fileSearchOriginal;
      (globalThis as any).__nexlet.files.status = (globalThis as any).__fileStatusOriginal;
    });
  }
});

test('内置 Everything 自动启动、中文文件索引、受限文件操作与退出', async () => {
  const scope = path.join(folder, '索引范围, 中文'),
    file = path.join(scope, 'Nexlet 搜索验收.txt');
  await mkdir(scope);
  await writeFile(file, 'Everything local index fixture');
  await call('settings', { fileSearchPaths: [scope] });
  await open('文件搜索');
  await page.getByRole('textbox', { name: 'Everything 文件搜索' }).fill('Nexlet 搜索验收');
  await expect(page.getByRole('option').filter({ hasText: 'Nexlet 搜索验收.txt' })).toBeVisible({
    timeout: 30000,
  });
  await page.screenshot({ path: path.join(root, 'test-results', 'filesearch.png') });
  await page.getByRole('button', { name: '复制文件路径', exact: true }).click();
  expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(file);
  const result: any = await call('fileSearch', '-exit');
  expect(result.status).toBe('ready');
  expect(result.items).toHaveLength(0);
  expect(((await call('fileSearch', 'Nexlet 搜索验收')) as any).items[0].path).toBe(file);
  await expect(
    call('fileAction', { action: 'open', path: path.join(folder, 'outside.txt') }),
  ).rejects.toThrow('当前搜索结果');
  await app.evaluate(({ shell }) => {
    (globalThis as any).__openOriginal = shell.openPath;
    (globalThis as any).__opened = [];
    shell.openPath = (async (file: string) => {
      (globalThis as any).__opened.push(file);
      return '';
    }) as any;
  });
  try {
    await call('fileAction', { action: 'open', path: file });
    expect(await app.evaluate(() => (globalThis as any).__opened)).toEqual([file]);
  } finally {
    await app.evaluate(({ shell }) => {
      shell.openPath = (globalThis as any).__openOriginal;
    });
  }
  const pid = await app.evaluate(() => (globalThis as any).__nexlet.files.engine.child?.pid);
  expect(pid).toBeGreaterThan(0);
  await restoreClipboard();
  await app.close();
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
  await start();
  await saveClipboard();
});

test('插件市场缓存、直接安装更新和失败保留旧数据', async () => {
  await home();
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(root, 'examples', 'hello-nexlet'));
  const bundle = zip.toBuffer().toString('base64');
  await app.evaluate(({ dialog }, bundle) => {
    const n = (globalThis as any).__nexlet;
    (globalThis as any).__marketOriginal = n.marketplace.download;
    (globalThis as any).__messageOriginal = dialog.showMessageBox;
    (globalThis as any).__marketEntry = {
      id: 'org.nexlet.hello',
      name: '市场便笺',
      description: '通过市场安装的便笺插件',
      author: 'Nexlet',
      category: '效率',
      version: '1.0.0',
      platforms: ['win32', 'darwin'],
      download:
        'https://github.com/Cansiny0320/Nexlet-plugins/releases/download/v1.0.0/hello-nexlet.nexlet',
    };
    n.marketplace.download = async (url: string) => {
      if ((globalThis as any).__marketOffline) throw new Error('测试离线');
      return url.endsWith('index.json')
        ? Buffer.from(
            JSON.stringify({ schemaVersion: 1, plugins: [(globalThis as any).__marketEntry] }),
          )
        : Buffer.from(bundle, 'base64');
    };
    dialog.showMessageBox = (async () => {
      throw new Error('不应弹出安装或更新确认');
    }) as any;
  }, bundle);
  try {
    const online: any = await call('marketplace', true);
    expect(online.entries).toHaveLength(1);
    expect(online.cached).toBe(false);
    await app.evaluate(() => {
      (globalThis as any).__marketOffline = true;
    });
    const offline: any = await call('marketplace', true);
    expect(offline.cached).toBe(true);
    expect(offline.entries).toHaveLength(1);
    expect(offline.error).toContain('离线');
    await app.evaluate(() => {
      (globalThis as any).__marketOffline = false;
    });
    await open('插件管理');
    await expect(page.locator('.market-card')).toHaveCount(1);
    await page.screenshot({ path: path.join(root, 'test-results', 'marketplace.png') });
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await expect
      .poll(() => call('pluginInspect').then((p: any) => p[0]?.source))
      .toBe('marketplace');
    await app.evaluate(() => {
      const n = (globalThis as any).__nexlet;
      n.store.set('plugin-data:org.nexlet.hello', { note: '更新必须保留' });
      (globalThis as any).__marketEntry.version = '1.0.1';
    });
    await call('marketplace', true);
    await expect(call('marketInstall', 'org.nexlet.hello')).rejects.toThrow('ID 或版本');
    expect(((await call('pluginInspect')) as any[])[0].manifest.version).toBe('1.0.0');
    const manifest = JSON.parse(zip.readAsText('plugin.json'));
    manifest.version = '1.0.1';
    zip.updateFile('plugin.json', Buffer.from(JSON.stringify(manifest)));
    await app.evaluate((_, bundle) => {
      const n = (globalThis as any).__nexlet;
      n.marketplace.download = async () => Buffer.from(bundle, 'base64');
    }, zip.toBuffer().toString('base64'));
    expect(await call('marketInstall', 'org.nexlet.hello')).toBe(true);
    expect(((await call('pluginInspect')) as any[])[0].manifest.version).toBe('1.0.1');
    expect(
      await app.evaluate(() =>
        (globalThis as any).__nexlet.store.get('plugin-data:org.nexlet.hello', {}),
      ),
    ).toEqual({ note: '更新必须保留' });
    await call('pluginRemove', { id: 'org.nexlet.hello', deleteData: true });
  } finally {
    await app.evaluate(({ dialog }) => {
      (globalThis as any).__nexlet.marketplace.download = (globalThis as any).__marketOriginal;
      dialog.showMessageBox = (globalThis as any).__messageOriginal;
    });
  }
});

test('启动器接收文件拖入并明确收进剪贴板', async () => {
  await writeFile(path.join(folder, 'Nexlet 测试文件.txt'), 'Nexlet drop test');
  await home();
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'test-drop-file';
    document.body.append(input);
  });
  await page.locator('#test-drop-file').setInputFiles(path.join(folder, 'Nexlet 测试文件.txt'));
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#test-drop-file')!;
    const transfer = new DataTransfer();
    transfer.items.add(input.files![0]);
    document
      .querySelector('.app-shell')!
      .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    input.remove();
  });
  await expect(page.getByLabel('待处理输入')).toBeVisible();
  await page.getByRole('button', { name: '收进剪贴板', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索剪贴板' })).toBeVisible();
  expect(
    ((await call('clips')) as any[]).some((i) =>
      i.files?.includes(path.join(folder, 'Nexlet 测试文件.txt')),
    ),
  ).toBeTruthy();
});

test('启动器接收图片粘贴并明确收录、重新复制图片', async () => {
  await home();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#6962ff';
    ctx.fillRect(0, 0, 32, 24);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((v) => r(v!), 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
    document
      .querySelector('.launcher-input')!
      .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
  });
  await expect(page.getByLabel('待处理输入')).toContainText('图片');
  await page.getByRole('button', { name: '收进剪贴板', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索剪贴板' })).toBeVisible();
  const pictures: any[] = (await call('clips', { kind: 'image' })) as any[];
  const picture = pictures.find((p) => p.width === 32 && p.height === 24);
  expect(picture).toBeTruthy();
  await call('clipAction', { action: 'copy', ids: [picture.id] });
  const size = await app.evaluate(async ({ clipboard, nativeImage }) => {
    const item = (await clipboard.read()).find((i) => i.types.includes('image/png'))!;
    const blob = await item.getType('image/png');
    return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize();
  });
  expect(size).toEqual({ width: 32, height: 24 });
});
