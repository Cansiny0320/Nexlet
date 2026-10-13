import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

let app: ElectronApplication, page: Page;
const call = (action: string, payload?: unknown): Promise<any> => page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), { action, payload });
const visible = () => app.evaluate(() => (globalThis as any).__nexlet.main.isVisible());

test.describe('系统搜索与执行结果', () => {
  test.skip(!['darwin', 'win32'].includes(process.platform), '需要桌面系统');
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await mkdir('.tmp', { recursive: true });
    const data = await mkdtemp(path.resolve('.tmp/system-search-'));
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [process.cwd()], env }); page = await app.firstWindow();
    await expect.poll(async () => (await call('state')).catalogLoading, { timeout: 45000 }).toBe(false);
    await app.evaluate(({ dialog }) => {
      const g = globalThis as any, n = g.__nexlet;
      g.systemCalls = []; g.confirmResponse = 0; g.failSystem = false;
      dialog.showMessageBox = (async (...args: any[]) => { g.lastSystemDialog = args.at(-1); return { response: g.confirmResponse, checkboxChecked: false }; }) as any;
      n.systemExecutor.execute = async (action: string) => { g.systemCalls.push(['action', action]); if (g.failSystem) throw Error('模拟系统拒绝访问'); };
      n.systemExecutor.open = async (url: string) => { g.systemCalls.push(['url', url]); if (g.failSystem) throw Error('模拟设置打开失败'); };
    });
  });
  test.afterAll(async () => { if (app) await app.close(); });
  test.beforeEach(async () => {
    await app.evaluate(() => {
      const g = globalThis as any; g.systemCalls = []; g.failSystem = false; g.confirmResponse = 0;
      g.__nexlet.main.show();
    });
    await page.locator('.launcher-input').fill('');
  });

  test('真实注册经过 IPC 搜索，设置、睡眠以及中英文/拼音均可发现', async () => {
    const queries: [string, string][] = [
      ['显示器', 'settings:display'], ['声音', 'settings:sound'], ['网络', 'settings:network'],
      ['蓝牙', 'settings:bluetooth'], ['Bluetooth Settings', 'settings:bluetooth'], ['lysz', 'settings:bluetooth'],
      ['打印机', 'settings:printers'], ['辅助功能', 'settings:accessibility'], ['隐私', 'settings:privacy'],
      ['更新', 'settings:update'], ['启动项', 'settings:startup'], ['电源', 'settings:power'],
      ['睡眠', 'action:sleep'], ['Sleep', 'action:sleep'], ['shuimian', 'action:sleep'], ['锁屏', 'action:lock'],
      ['Reboot', 'action:restart'], ['关机', 'action:shutdown'], ['注销', 'action:logout'], ['Show Desktop', 'action:desktop']
    ];
    for (const [query, id] of queries) expect((await call('search', query)).map((c: any) => c.id), query).toContain('system:' + id);
    const state = await call('state');
    expect(state.commands.filter((c: any) => c.kind === 'system').length).toBeGreaterThan(30);
    expect(state.commands.filter((c: any) => c.kind === 'system').every((c: any) => !c.url && !c.action)).toBe(true);
    await page.locator('.launcher-input').fill('睡眠');
    await expect(page.getByRole('button', { name: '睡眠', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '电源和睡眠设置', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/system-search-sleep.png' });
  });

  test('macOS 真正扫描系统目录并保留本地化名称和英文检索', async () => {
    test.skip(process.platform !== 'darwin', 'macOS 本地化应用索引');
    const commands = (await call('state')).commands;
    for (const [file, english] of [
      ['/System/Applications/System Settings.app', 'System Settings'],
      ['/System/Applications/Utilities/Terminal.app', 'Terminal'],
      ['/System/Applications/Utilities/Audio MIDI Setup.app', 'Audio MIDI Setup'],
      ['/System/Library/CoreServices/Applications/Folder Actions Setup.app', 'Folder Actions Setup'],
      ['/System/Library/CoreServices/Finder.app', 'Finder']
    ]) {
      const command = commands.find((c: any) => c.path === file);
      expect(command, file).toBeTruthy();
      expect((await call('search', english)).map((c: any) => c.id)).toContain(command.id);
      expect((await call('search', command.name)).map((c: any) => c.id)).toContain(command.id);
    }
    const settings = commands.find((c: any) => c.path === '/System/Applications/System Settings.app');
    if (settings.name === '系统设置') {
      for (const q of ['xtsz', 'xitongshezhi']) expect((await call('search', q)).map((c: any) => c.id)).toContain(settings.id);
      await page.locator('.launcher-input').fill('设置');
      await expect(page.getByRole('button', { name: '系统设置', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '文件夹操作设置', exact: true })).toBeVisible();
      await page.screenshot({ path: 'test-results/system-search-settings.png', fullPage: true });
    }
  });

  test('取消睡眠保留搜索和最近使用；默认选中取消', async () => {
    const recent = (await call('state')).recent;
    await page.locator('.launcher-input').fill('睡眠');
    await page.getByRole('button', { name: '睡眠', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).lastSystemDialog?.message)).toContain('睡眠');
    expect(await app.evaluate(() => (globalThis as any).lastSystemDialog)).toMatchObject({ buttons: ['取消', '睡眠'], defaultId: 0, cancelId: 0 });
    await expect(page.locator('.launcher-input')).toHaveValue('睡眠');
    expect(await app.evaluate(() => (globalThis as any).systemCalls)).toEqual([]);
    expect((await call('state')).recent).toEqual(recent); expect(await visible()).toBe(true);
  });

  test('确认后只执行一次并记录成功；未知 ID 不能执行', async () => {
    await app.evaluate(() => { (globalThis as any).confirmResponse = 1; });
    await page.locator('.launcher-input').fill('睡眠');
    await page.getByRole('button', { name: '睡眠', exact: true }).click();
    await expect.poll(visible).toBe(false);
    expect(await app.evaluate(() => (globalThis as any).systemCalls)).toEqual([['action', 'sleep']]);
    expect((await call('state')).recent[0]).toBe('system:action:sleep');
    await expect(call('launch', { id: 'system:action:sleep;shutdown' })).rejects.toThrow('不存在');
  });

  test('系统失败保留窗口、输入、最近使用，随后可以重试', async () => {
    const recent = (await call('state')).recent;
    await app.evaluate(() => { (globalThis as any).failSystem = true; });
    await page.locator('.launcher-input').fill('锁屏');
    await page.getByRole('button', { name: '锁屏', exact: true }).click();
    await expect(page.locator('.toast.error')).toContainText('模拟系统拒绝访问');
    expect(await visible()).toBe(true); expect((await call('state')).recent).toEqual(recent);
    await expect(page.locator('.launcher-input')).toHaveValue('锁屏');
    await app.evaluate(() => { (globalThis as any).failSystem = false; });
    await page.getByRole('button', { name: '锁屏', exact: true }).click();
    await expect.poll(visible).toBe(false);
    expect((await call('state')).recent[0]).toBe('system:action:lock');
  });

  test('设置执行绑定平台 URI，打开失败不记成功', async () => {
    const recent = (await call('state')).recent;
    await app.evaluate(() => { (globalThis as any).failSystem = true; });
    await expect(call('launch', { id: 'system:settings:sound', url: 'https://unexpected.invalid' })).rejects.toThrow('模拟设置打开失败');
    expect((await call('state')).recent).toEqual(recent); expect(await visible()).toBe(true);
    await app.evaluate(() => { (globalThis as any).failSystem = false; });
    expect(await call('launch', { id: 'system:settings:sound' })).toEqual({ opened: true });
    const target = process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.Sound-Settings.extension' : 'ms-settings:sound';
    expect(await app.evaluate(() => (globalThis as any).systemCalls)).toEqual([['url', target], ['url', target]]);
    expect((await call('state')).recent[0]).toBe('system:settings:sound');
    expect(await visible()).toBe(false);
  });
});
