import { afterEach, beforeEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/store';
import type { ClipItem } from '../src/shared/types';

let store: Store, directory: string;
const clip = (id: string, text: string, extra: Partial<ClipItem> = {}): ClipItem => ({
  id,
  text,
  hash: id,
  kind: 'text',
  createdAt: Date.now(),
  favorite: false,
  ...extra,
});
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nexlet-pages-'));
  store = new Store(directory);
});
afterEach(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

it('摘要分页保持索引顺序，长文本按需读取，搜索覆盖摘要以外的 Unicode 全文', () => {
  const full = '🙂'.repeat(700) + ' ÄBC 末尾查找';
  store.addClip(clip('long', full));
  store.addClip(clip('new', 'latest'));
  const index = store.clipIndex();
  expect(index.ids).toEqual(['new', 'long']);
  const page = store.clipPage(index.ids, index.revision);
  expect(page.items.map((item) => item.id)).toEqual(index.ids);
  expect(page.items[1].text.length).toBeLessThanOrEqual(600);
  expect(page.items[1].textLength).toBe(Array.from(full).length);
  expect(page.items[1]).not.toHaveProperty('hash');
  expect(store.clip('long')?.text).toBe(full);
  expect(store.clipIndex('äbc').ids).toEqual(['long']);
  expect(store.clipIndex('末尾查找').ids).toEqual(['long']);
  expect(store.clips()[1].text).toBe(full);
});

it('收藏、类型及中转 ID 范围在整个索引上筛选', () => {
  store.addClip(
    clip('a', 'image', { kind: 'image', favorite: true, thumbnail: 'data:image/png;base64,a' }),
  );
  store.addClip(clip('b', 'plain'));
  store.addClip(clip('c', 'files', { kind: 'files', files: ['/sample'] }));
  expect(store.clipIndex('', 'favorite').ids).toEqual(['a']);
  expect(store.clipIndex('', 'image').ids).toEqual(['a']);
  expect(store.clipIndex('', 'all', ['a', 'c']).ids).toEqual(['c', 'a']);
  expect(store.clipIndex('', 'all', []).ids).toEqual([]);
});

it('分页期间新增、排序、收藏或删除使旧版本失效，不会混合不同列表', () => {
  store.addClip(clip('a', 'a'));
  store.addClip(clip('b', 'b'));
  for (const mutate of [
    () => store.addClip(clip('c', 'c')),
    () => store.touchClips(['a']),
    () => store.favorite('b', true),
    () => store.deleteClips(['b']),
  ]) {
    const old = store.clipIndex();
    mutate();
    expect(store.clipPage(old.ids, old.revision)).toMatchObject({ stale: true, items: [] });
  }
  expect(store.clipIndex().ids).toEqual(['a', 'c']);
});

it('保留策略与旧数据兼容，分页不截断完整复制内容或丢失收藏', () => {
  store.addClip(clip('favorite', 'keep', { favorite: true }));
  store.addClip(clip('old', 'old'));
  store.addClip(clip('new', 'new'));
  store.set('settings', { ...store.settings(), maxClipboardItems: 1 });
  store.prune();
  expect(store.clipIndex().ids).toEqual(['new', 'favorite']);
  store.close();
  store = new Store(directory);
  const index = store.clipIndex();
  expect(store.clipPage(index.ids, index.revision).items.map((item) => item.id)).toEqual(index.ids);
});
