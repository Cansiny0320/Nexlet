import { afterEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/store';
import { ConfigProfiles } from '../src/main/config-profile';
const directory = mkdtempSync(path.join(os.tmpdir(), 'nexlet-profile-'));
let store: Store;
afterEach(() => {
  store?.db.close();
  rmSync(directory, { recursive: true, force: true });
});
it('导出允许的配置，不包含秘密、草稿、历史或插件私有数据', () => {
  store = new Store(directory);
  store.set('tool-drafts', { secret: 'draft-secret' });
  store.set('plugin-data:org.nexlet.ai-actions', {
    apiKey: 'key-secret',
    actions: [
      {
        id: 'a',
        name: 'A',
        prompt: 'hello',
        model: 'test',
        baseUrl: 'https://example.com/v1',
        apiKey: 'nested-secret',
      },
    ],
  });
  const profiles = new ConfigProfiles(store, () => []);
  const text = profiles.export();
  expect(text).toContain('hello');
  expect(text).not.toMatch(/secret|tool-drafts|apiKey/);
});
it('JSONC 差异按类别应用、事务回滚、撤销及过期预览保护', () => {
  store = new Store(directory);
  const profiles = new ConfigProfiles(store, () => []);
  const sourcePlatform = process.platform === 'win32' ? 'darwin' : 'win32';
  const preview = profiles.preview(
    `{ // editable\n"version":1,"platform":"${sourcePlatform}","categories":{"settings":{"theme":"dark"},"snippets":[{"id":"a","name":"A","body":"hello","group":""}]}}`,
  );
  expect(preview.warnings.length).toBeGreaterThan(0);
  expect(preview.changes.map((item) => item.category)).toEqual(['settings', 'snippets']);
  expect(() =>
    profiles.apply(preview.token, ['settings'], (_next, write) => {
      write();
      throw Error('conflict');
    }),
  ).toThrow('conflict');
  expect(store.settings().theme).toBe('system');
  profiles.apply(preview.token, ['settings']);
  expect(store.settings().theme).toBe('dark');
  expect(store.get('productivity', { snippets: [] }).snippets).toEqual([]);
  profiles.undo();
  expect(store.settings().theme).toBe('system');
  const stale = profiles.preview('{"version":1,"categories":{"settings":{"theme":"dark"}}}');
  store.set('settings', { theme: 'light' });
  expect(() => profiles.apply(stale.token, ['settings'])).toThrow();
});
it('同平台配置不产生跨平台警告', () => {
  store = new Store(directory);
  const profiles = new ConfigProfiles(store, () => []);
  const preview = profiles.preview(
    JSON.stringify({ version: 1, platform: process.platform, categories: {} }),
  );
  expect(preview.warnings).toEqual([]);
});
it('拒绝非法配置、未知敏感字段与任意插件数据库导入', () => {
  store = new Store(directory);
  const profiles = new ConfigProfiles(store, () => []);
  for (const input of [
    'bad',
    '{"version":1,"categories":{"settings":{"apiKey":"x"}}}',
    '{"version":1,"categories":{"pluginDatabase":{}}}',
    '{"version":1,"categories":{"settings":{"maxClipboardItems":-1}}}',
  ])
    expect(() => profiles.preview(input)).toThrow();
});
it('导入使用与网页入口及 AI 动作编辑器一致的合同', () => {
  store = new Store(directory);
  const profiles = new ConfigProfiles(store, () => []);
  const action = {
    id: 'polish',
    name: 'Polish',
    prompt: 'Improve this text',
    model: '',
    baseUrl: 'https://example.com/v1',
  };
  for (const aiActions of [
    [{ ...action, id: 'invalid:id' }],
    [{ ...action, prompt: '  ' }],
    [{ ...action, name: ' ' }],
  ])
    expect(() =>
      profiles.preview(JSON.stringify({ version: 1, categories: { aiActions } })),
    ).toThrow();
  for (const url of ['https://{query}.example.com/', 'https://example.com/without-placeholder'])
    expect(() =>
      profiles.preview(
        JSON.stringify({
          version: 1,
          categories: { webShortcuts: [{ id: 'search', name: 'Search', type: 'search', url }] },
        }),
      ),
    ).toThrow();
  expect(
    profiles.preview(JSON.stringify({ version: 1, categories: { aiActions: [action] } })).changes[0]
      .category,
  ).toBe('aiActions');
});
it('配置导入不能绕过面板总数量和本地入口名称限制', () => {
  store = new Store(directory);
  const profiles = new ConfigProfiles(store, () => []);
  const panel = profiles.snapshot().panel;
  const command = (index: number) => ({
    kind: 'command',
    id: 'item' + index,
    commandId: 'tool:' + index,
  });
  const items = [
    {
      kind: 'folder',
      id: 'folder1',
      name: 'First',
      children: Array.from({ length: 101 }, (_, i) => command(i)),
    },
    {
      kind: 'folder',
      id: 'folder2',
      name: 'Second',
      children: Array.from({ length: 100 }, (_, i) => command(i + 101)),
    },
  ];
  expect(() =>
    profiles.preview(JSON.stringify({ version: 1, categories: { panel: { ...panel, items } } })),
  ).toThrow();
  const commands = {
    ...profiles.snapshot().commands,
    localEntries: [{ id: 'empty', name: '  ', path: '/tmp' }],
  };
  expect(() =>
    profiles.preview(JSON.stringify({ version: 1, categories: { commands } })),
  ).toThrow();
});
