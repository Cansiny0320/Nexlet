import { expect, it } from 'vite-plus/test';
import { searchCommands, highlightRanges } from '../src/shared/search';
import { SearchPreferences } from '../src/main/search-preferences';
import type { Command } from '../src/shared/types';
const command = (id: string, name: string, keywords: string[] = []): Command => ({
  id,
  name,
  keywords,
  kind: 'tool',
  subtitle: '',
});
it('轻微错拼召回，短词和无关词不模糊匹配；精确匹配优先于偏好', () => {
  const commands = [
    command('chrome', 'Chrome'),
    command('chorme', 'Chorme Extra'),
    command('clip', 'Clipboard'),
    command('code', 'Code'),
  ];
  expect(searchCommands(commands, 'chorme', [], 60, { chrome: 80 })[0].id).toBe('chorme');
  expect(searchCommands(commands, 'chorme').map((item) => item.id)).toContain('chrome');
  expect(searchCommands(commands, 'zode')).toEqual([]);
  expect(searchCommands(commands, 'chr').map((item) => item.id)).toEqual(['chrome']);
  expect(
    searchCommands(
      [command('alias', 'Tool', ['Exact']), command('prefix', 'Exact Result')],
      'exact',
      [],
      60,
      { prefix: 80 },
    )[0].id,
  ).toBe('alias');
});
it('高亮支持原文、拼音和 Unicode，不插入 HTML', () => {
  expect(highlightRanges('计算稿纸', 'jsgz')).toEqual([[0, 4]]);
  expect(highlightRanges('JSON Tools', 'json')).toEqual([[0, 4]]);
  expect(highlightRanges('计算稿纸', '稿纸')).toEqual([[2, 4]]);
});
it('仅学习普通输入的已匹配指令，不保存粘贴、结果正文或 URL，允许清除', () => {
  const data = new Map<string, unknown>();
  const store = {
    get: <T>(key: string, fallback: T) => (data.get(key) as T) ?? fallback,
    set: (key: string, value: unknown) => {
      data.set(key, value);
    },
  };
  const preferences = new SearchPreferences(store);
  const clip = command('clip', 'Clipboard');
  preferences.learn('clip', 'paste', clip);
  preferences.learn('Clipboard body', 'result', clip);
  preferences.learn('https://example.com', 'input', clip);
  expect(data.size).toBe(0);
  preferences.learn('clip', 'input', clip);
  expect(preferences.weights('clip').clip).toBeGreaterThan(0);
  expect(preferences.weights('unrelated')).toEqual({});
  preferences.clear();
  expect(preferences.weights('clip')).toEqual({});
});
