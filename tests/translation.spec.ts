import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server, type ServerResponse } from 'node:http';
let app: ElectronApplication,
  page: Page,
  plugin: Page,
  folder: string,
  server: Server,
  origin: string;
const received: { path: string; authorization?: string; body: any }[] = [];
const delayed: ServerResponse[] = [];
const errors: string[] = [];
const root = process.cwd(),
  source = path.resolve(
    process.env.NEXLET_PLUGINS_DIR || path.resolve(root, '../Nexlet-plugins'),
    'plugins/translate',
  );
test.skip(
  !existsSync(path.join(source, 'plugin.json')),
  '需要相邻 Nexlet-plugins 源码（可设置 NEXLET_PLUGINS_DIR）；单仓 CI 不运行跨仓用例',
);
async function call(action: string, payload?: unknown) {
  if (action === 'pluginInstall')
    await app.evaluate(() => {
      (globalThis as any).__translationInstalling = true;
    });
  try {
    return await page.evaluate(
      ({ action, payload }) => (window as any).nexlet.call(action, payload),
      {
        action,
        payload,
      },
    );
  } finally {
    if (action === 'pluginInstall')
      await app.evaluate(() => {
        (globalThis as any).__translationInstalling = false;
      });
  }
}
async function launch(payload = '') {
  await call('launch', { id: 'plugin:org.nexlet.translate:translate', payload });
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((p) => p.url().startsWith('nexlet-plugin://org.nexlet.translate/')),
    )
    .toBe(true);
  plugin = app
    .context()
    .pages()
    .find((p) => p.url().startsWith('nexlet-plugin://org.nexlet.translate/'))!;
  await expect(plugin.locator('#input')).toHaveValue(payload);
  plugin.on('pageerror', (e) => errors.push(e.message));
}
async function chooseLLM() {
  await plugin.locator('#engine-llm').click();
}
async function configure() {
  await plugin.locator('#settings-toggle').click();
  await plugin.locator('#base-url').fill(origin + '/v1');
  await plugin.locator('#model').fill('fixture-model');
  await plugin.locator('#api-key').fill('fixture-secret');
  await plugin.locator('#save-settings').click();
  await expect(plugin.locator('#settings-status')).toContainText('仅本次会话');
  await plugin.locator('#settings-toggle').click();
  await chooseLLM();
}
async function translate(text: string) {
  await plugin.locator('#input').fill(text);
  await plugin.locator('#translate').click();
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'nexlet-translation-'));
  const archive = new AdmZip();
  archive.addLocalFolder(source);
  archive.writeZip(path.join(folder, 'translate.nexlet'));
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const data = body ? JSON.parse(body) : null;
      received.push({ path: req.url || '', authorization: req.headers.authorization, body: data });
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: origin + '/should-not-be-requested' });
        res.end();
        return;
      }
      const text = data?.messages?.[1]?.content || '';
      if (text === 'slow') {
        delayed.push(res);
        return;
      }
      if (text === 'error-401') {
        res.writeHead(401);
        res.end('{"error":"secret should not be rendered"}');
        return;
      }
      if (text === 'malformed') {
        res.end('not JSON');
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '译文：' + text }, finish_reason: 'stop' }],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
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
  app = await electron.launch({ args: [root], env });
  page = await app.firstWindow();
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await app.evaluate(({ dialog, clipboard, safeStorage, nativeTheme }, source) => {
    const g = globalThis as any;
    g.__translationPrompts = [];
    g.__translationInstallPrompts = [];
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as any;
    dialog.showMessageBox = (async (_owner: unknown, options: any) => {
      if (g.__translationInstalling) {
        g.__translationInstallPrompts.push(options ?? _owner);
        return { response: 1, checkboxChecked: false };
      }
      g.__translationPrompts.push(options);
      throw new Error('不应出现插件安装或联网确认弹窗');
    }) as any;
    clipboard.writeText = (async (text: string) => {
      g.__translationCopied = text;
    }) as any;
    safeStorage.isEncryptionAvailable = () => false;
    nativeTheme.themeSource = 'light';
    const network = g.__nexlet.plugins.network,
      fetcher = network.fetcher.bind(network);
    g.__googleRequests = [];
    g.__googleLive = false;
    network.fetcher = async (url: string, init: RequestInit) => {
      if (!url.startsWith('https://translate.googleapis.com/') || g.__googleLive)
        return fetcher(url, init);
      const params = new URL(url).searchParams,
        text = params.get('q');
      g.__googleRequests.push({ text, target: params.get('tl') });
      if (text === 'slow-google')
        await new Promise<void>((resolve) => {
          g.__resolveGoogle = resolve;
        });
      return new Response(JSON.stringify([[[`Google：${text}`]], null, 'en']));
    };
  }, source);
  await call('pluginInstall', { development: true });
  expect(await app.evaluate(() => (globalThis as any).__translationInstallPrompts.length)).toBe(1);
  await launch('Hello from launcher');
});
test.afterAll(async () => {
  for (const response of delayed) response.destroy();
  await app?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('插件标签显示声明的图标', async () => {
  const icon = (await call('state')).plugins.find(
    (p: any) => p.manifest.id === 'org.nexlet.translate',
  ).icon;
  expect(icon).toMatch(/^data:image\//);
  await expect(page.locator('.plugin-pill img')).toHaveAttribute('src', icon);
  await expect
    .poll(() =>
      page.locator('.plugin-pill img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .locator('.titlebar')
    .screenshot({ path: path.join(root, 'test-results', 'translation-titlebar.png') });
});

test('Google 自动翻译支持带入、防抖、输入法、语言切换和撤销', async () => {
  await expect(plugin.locator('#output')).toHaveValue('Google：Hello from launcher');
  await plugin.clock.install();
  await plugin.clock.pauseAt(new Date());
  const hits = () => app.evaluate(() => (globalThis as any).__googleRequests.length);
  const before = await hits();
  await plugin.locator('#input').fill('H');
  await plugin.clock.runFor(250);
  await plugin.locator('#input').fill('Hello');
  await plugin.clock.runFor(399);
  expect(await hits()).toBe(before);
  await plugin.clock.runFor(1);
  await expect(plugin.locator('#output')).toHaveValue('Google：Hello');
  expect(await hits()).toBe(before + 1);
  await plugin.locator('#input').dispatchEvent('compositionstart');
  await plugin.locator('#input').fill('ni');
  await plugin.clock.runFor(800);
  expect(await hits()).toBe(before + 1);
  await plugin.locator('#input').fill('你好');
  await plugin.locator('#input').dispatchEvent('compositionend');
  await plugin.clock.runFor(400);
  await expect(plugin.locator('#output')).toHaveValue('Google：你好');
  await plugin.locator('#target').selectOption('en');
  await plugin.clock.runFor(400);
  await expect.poll(() => hits()).toBe(before + 3);
  expect(await app.evaluate(() => (globalThis as any).__googleRequests.at(-1).target)).toBe('en');
  await plugin.locator('#input').fill('manual');
  await plugin.locator('#translate').click();
  await expect(plugin.locator('#output')).toHaveValue('Google：manual');
  await plugin.clock.runFor(800);
  expect(await hits()).toBe(before + 4);
  await plugin.locator('#input').fill('discard');
  await plugin.locator('#clear-input').click();
  await plugin.clock.runFor(800);
  expect(await hits()).toBe(before + 4);
  await expect(plugin.locator('#output')).toHaveValue('');
  for (const value of ['   ', 'x'.repeat(5001)]) {
    await plugin.locator('#input').fill(value);
    await plugin.clock.runFor(500);
  }
  expect(await hits()).toBe(before + 4);
  await plugin.locator('#input').fill('slow-google');
  await plugin.clock.runFor(400);
  await expect.poll(() => hits()).toBe(before + 5);
  await plugin.locator('#input').fill('fresh-google');
  await plugin.clock.runFor(400);
  await expect(plugin.locator('#output')).toHaveValue('Google：fresh-google');
  await app.evaluate(() => (globalThis as any).__resolveGoogle());
  await expect(plugin.locator('#output')).toHaveValue('Google：fresh-google');
  await plugin.locator('#input').fill('switch away');
  await chooseLLM();
  await plugin.clock.runFor(800);
  expect(await hits()).toBe(before + 6);
  await plugin.locator('#input').fill('Hello from launcher');
  await plugin.clock.runFor(800);
  expect(received).toHaveLength(0);
  await plugin.locator('#target').selectOption('zh-CN');
  await plugin.clock.resume();
});

test('首次安装确认权限后，带入文字按需翻译和复制', async () => {
  expect(received).toHaveLength(0);
  await expect(plugin.locator('#input')).toHaveValue('Hello from launcher');
  await configure();
  await plugin.locator('#translate').click();
  await expect(plugin.locator('#output')).toHaveValue('译文：Hello from launcher');
  const request = received.at(-1)!;
  expect(request.path).toBe('/v1/chat/completions');
  expect(request.authorization).toBe('Bearer fixture-secret');
  expect(request.body).toMatchObject({ model: 'fixture-model', stream: false });
  expect(await app.evaluate(() => (globalThis as any).__translationPrompts)).toEqual([]);
  await plugin.locator('#settings-toggle').click();
  await expect(plugin.locator('#reset-permissions')).toHaveCount(0);
  await plugin.locator('#settings-toggle').click();
  await plugin.locator('#copy').click();
  expect(await app.evaluate(() => (globalThis as any).__translationCopied)).toBe(
    '译文：Hello from launcher',
  );
  const data = await app.evaluate(() =>
    (globalThis as any).__nexlet.store.get('plugin-data:org.nexlet.translate', {}),
  );
  expect(JSON.stringify(data)).not.toContain('fixture-secret');
  expect(JSON.stringify(data)).not.toContain('Hello from launcher');
  expect(
    await plugin.evaluate(() =>
      fetch('https://example.com').then(
        () => false,
        () => true,
      ),
    ),
  ).toBe(true);
  expect(await plugin.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await plugin.screenshot({ path: path.join(root, 'test-results', 'translation.png') });
});

test('翻译工作区适配窗口高度，窄窗不产生横向溢出', async () => {
  const bounds = await app.evaluate(() => (globalThis as any).__nexlet.main.getBounds());
  try {
    for (const [width, height] of [
      [800, 600],
      [1000, 800],
      [520, 720],
    ]) {
      await app.evaluate(
        (_, { width, height }) => {
          (globalThis as any).__nexlet.main.setContentSize(width, height);
        },
        { width, height },
      );
      await expect
        .poll(() => plugin.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      if (width > 540)
        await expect
          .poll(() => plugin.evaluate(() => document.documentElement.scrollHeight <= innerHeight))
          .toBe(true);
    }
  } finally {
    await app.evaluate((_, bounds) => (globalThis as any).__nexlet.main.setBounds(bounds), bounds);
  }
});

test('首次联网与兼容旧 resetPermissions 调用均不弹窗，仍拒绝重定向', async () => {
  await plugin.evaluate(() => (window as any).nexlet.network.resetPermissions());
  const before = received.length;
  await translate('direct request');
  await expect(plugin.locator('#output')).toHaveValue('译文：direct request');
  expect(received.length).toBe(before + 1);
  expect(await app.evaluate(() => (globalThis as any).__translationPrompts)).toEqual([]);
  expect(
    await app.evaluate(() =>
      (globalThis as any).__nexlet.store.get('plugin-network:org.nexlet.translate', []),
    ),
  ).toEqual([]);
  const failure = await plugin.evaluate(async (origin) => {
    try {
      await (window as any).nexlet.network.request({ id: 'redirect', url: origin + '/redirect' });
      return '';
    } catch (e) {
      return String(e);
    }
  }, origin);
  expect(failure).toContain('网络连接失败');
  expect(received.some((r) => r.path === '/should-not-be-requested')).toBe(false);
});

test('取消、编辑原文与再次进入使旧请求失效，并正确展示鉴权/格式错误', async () => {
  await translate('slow');
  await expect.poll(() => delayed.length).toBe(1);
  await plugin.locator('#cancel').click();
  await expect(plugin.locator('#status')).toHaveText('已取消翻译');
  await translate('fresh');
  await expect(plugin.locator('#output')).toHaveValue('译文：fresh');
  delayed[0].end('{"choices":[{"message":{"content":"stale"}}]}');
  await expect(plugin.locator('#output')).toHaveValue('译文：fresh');
  await translate('slow');
  await expect.poll(() => delayed.length).toBe(2);
  await plugin.locator('#input').fill('new input');
  await expect(plugin.locator('#output')).toHaveValue('');
  await expect(plugin.locator('#translate')).toBeEnabled();
  await translate('error-401');
  await expect(plugin.locator('#status')).toContainText('401');
  await expect(plugin.locator('#status')).not.toContainText('secret should');
  await translate('malformed');
  await expect(plugin.locator('#status')).toContainText('无法解析');
  await plugin.locator('#settings-toggle').click();
  await plugin.locator('#model').fill('updated-model');
  await expect(plugin.locator('#translate')).toBeDisabled();
  await plugin.locator('#model').fill('fixture-model');
  await plugin.locator('#save-settings').click();
  await expect(plugin.locator('#settings-status')).toHaveText('设置已保存');
  await plugin.locator('#settings-toggle').click();
  await translate('slow');
  await expect.poll(() => delayed.length).toBe(3);
  await launch('new activation');
  await expect(plugin.locator('#output')).toHaveValue('');
  await expect(plugin.locator('#translate')).toBeEnabled();
  await plugin.locator('#input').fill('x'.repeat(5001));
  await expect(plugin.locator('#translate')).toBeDisabled();
});

test('停用清理请求和会话密钥，重新进入保留配置且未授权插件不能使用新能力', async () => {
  await translate('slow');
  await expect.poll(() => delayed.length).toBe(4);
  await call('pluginToggle', { id: 'org.nexlet.translate', enabled: false });
  expect(await app.evaluate(() => (globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(
    0,
  );
  await call('pluginToggle', { id: 'org.nexlet.translate', enabled: true });
  await launch('after reopen');
  expect(await plugin.evaluate(() => (window as any).nexlet.secrets.get('apiKey'))).toBeNull();
  await expect(plugin.locator('#engine-llm')).toHaveAttribute('aria-pressed', 'true');
  await plugin.locator('#settings-toggle').click();
  await expect(plugin.locator('#model')).toHaveValue('fixture-model');
  await plugin.locator('#settings-toggle').click();
  await app.evaluate(
    ({ dialog }, directory) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [directory] })) as any;
    },
    path.join(root, 'examples/hello-nexlet'),
  );
  await call('pluginInstall', { development: true });
  await call('launch', { id: 'plugin:org.nexlet.hello:note' });
  const denial = await app.evaluate(async () => {
    const active = (globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.hello');
    return active.view.webContents.executeJavaScript(
      `Promise.all([nexlet.network.request({id:'deny',url:'https://example.com'}).catch(e=>String(e)),nexlet.secrets.get('apiKey').catch(e=>String(e))])`,
    );
  });
  expect(denial[0]).toContain('未授权：network.request');
  expect(denial[1]).toContain('未授权：secrets');
  await launch('Hello, world!');
  await plugin.locator('#engine-google').click();
});

test('Google 实际接口通过插件 HTTP 桥接返回译文', async () => {
  test.skip(process.env.NEXLET_TRANSLATION_LIVE !== '1', '仅显式启用时使用公开样例调用 Google');
  await app.evaluate(() => ((globalThis as any).__googleLive = true));
  await plugin.locator('#target').selectOption('zh-CN');
  await plugin.locator('#input').fill('Hello, world!');
  await expect(plugin.locator('#output')).toHaveValue(/你好|您好/, { timeout: 45000 });
  await expect(plugin.locator('#detected')).toContainText('英语');
  await app.evaluate(() => ((globalThis as any).__googleLive = false));
  await plugin.screenshot({ path: path.join(root, 'test-results', 'translation-google.png') });
  expect(errors).toEqual([]);
});

test('打包产物可真实安装，配置保留，卸载清理数据和授权', async () => {
  const archive = path.join(folder, 'translate.nexlet');
  await readFile(archive);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as any;
  }, archive);
  await call('pluginInstall', { development: false });
  await launch('packaged plugin');
  expect(await plugin.evaluate(() => (window as any).nexlet.storage.get('llm'))).toMatchObject({
    baseUrl: origin + '/v1',
    model: 'fixture-model',
  });
  await call('pluginRemove', { id: 'org.nexlet.translate', deleteData: true });
  const stored = await app.evaluate(() => {
    const s = (globalThis as any).__nexlet.store;
    return {
      data: s.get('plugin-data:org.nexlet.translate', {}),
      secrets: s.get('plugin-secrets:org.nexlet.translate', {}),
      grants: s.get('plugin-network:org.nexlet.translate', []),
    };
  });
  expect(stored).toEqual({ data: {}, secrets: {}, grants: [] });
  expect(errors).toEqual([]);
  expect(await app.evaluate(() => (globalThis as any).__translationPrompts)).toEqual([]);
});
