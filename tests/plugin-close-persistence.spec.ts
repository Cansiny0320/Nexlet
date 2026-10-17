import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('onOut flushes local documents and credentials but cannot start new work', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-close-')),
    plugin = path.join(directory, 'plugin'),
    id = 'org.nexlet.close-fixture';
  await mkdir(plugin);
  await writeFile(
    path.join(plugin, 'plugin.json'),
    JSON.stringify({
      id,
      name: 'Close fixture',
      version: '1.0.0',
      apiVersion: 1,
      main: 'index.html',
      backend: 'backend.cjs',
      permissions: ['secrets', 'backend', 'network.request'],
      features: [{ code: 'test', name: 'Close fixture', keywords: ['close'] }],
    }),
  );
  await writeFile(
    path.join(plugin, 'index.html'),
    '<!doctype html><html><body>Close fixture<script src="main.js"></script></body></html>',
  );
  await writeFile(path.join(plugin, 'backend.cjs'), 'exports.handlers={echo:()=>true};');
  await writeFile(
    path.join(plugin, 'main.js'),
    `nexlet.onOut(async()=>{
    const results={};
    for(const [name,run] of Object.entries({document:()=>nexlet.database.put({id:'final',value:'saved'}),secret:()=>nexlet.secrets.set('final','saved'),stop:()=>nexlet.backend.stop(),network:()=>nexlet.network.request({id:'late',url:'https://example.com'}),backend:()=>nexlet.backend.call({id:'late',method:'echo'})})){
      try{await run();results[name]='ok'}catch(e){results[name]=e.message}
    }
    await nexlet.storage.set('results',results);
  });`,
  );
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(directory, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.resolve('.')], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
    await app.evaluate(({ dialog }, plugin) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [plugin] });
    }, plugin);
    await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
    await page.evaluate((id) => window.nexlet.call('launch', { id: `plugin:${id}:test` }), id);
    await app.evaluate(async (_, id) => {
      await (globalThis as any).__nexlet.plugins.runtime.sessions.get(id).queue;
    }, id);
    await page.evaluate(() => window.nexlet.call('window', { action: 'exitPlugin' }));
    const data = await app.evaluate((_, id) => {
      const manager = (globalThis as any).__nexlet.plugins;
      return {
        results: manager.store.get('plugin-data:' + id, {}).results,
        document: manager.sdk.database.get(id, 'final'),
      };
    }, id);
    expect(data.results).toMatchObject({ document: 'ok', secret: 'ok', stop: 'ok' });
    expect(data.document.value).toBe('saved');
    expect(data.results.network).toContain('插件会话已结束');
    expect(data.results.backend).toContain('插件会话已结束');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
