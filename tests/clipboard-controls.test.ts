import { afterEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/store';
import { shouldRecordClipboard, textClipboardHash } from '../src/shared/clipboard';
let store: Store, directory: string;
afterEach(() => {
  if (store) {
    store.close();
    store = undefined as unknown as Store;
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it('富文本与纯文本分别去重，摘要排除完整 HTML 和 OCR 文本', () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'nexlet-controls-'));
  store = new Store(directory);
  expect(textClipboardHash('A', '<b>A</b>')).not.toBe(textClipboardHash('A', '<i>A</i>'));
  expect(textClipboardHash('A')).toBe('text:A');
  store.addClip({
    id: 'html',
    kind: 'text',
    text: 'A',
    html: '<b>' + 'A'.repeat(20000) + '</b>',
    hash: 'a',
    createdAt: 100,
    favorite: false,
  });
  const index = store.clipIndex();
  const summary = store.clipPage(index.ids, index.revision).items[0];
  expect(summary).not.toHaveProperty('html');
  expect(summary.hasHtml).toBe(true);
  expect(store.clip('html')?.html?.length).toBeGreaterThan(20000);
});
it('暂停到期与应用排除，未知来源不冒充被排除应用', () => {
  const settings = {
    clipboardEnabled: true,
    clipboardPausedUntil: 200,
    clipboardExcludedApps: ['com.example.private'],
  };
  expect(shouldRecordClipboard(settings, null, 199)).toBe(false);
  expect(shouldRecordClipboard(settings, null, 200)).toBe(true);
  expect(shouldRecordClipboard(settings, { app: 'COM.EXAMPLE.PRIVATE' }, 201)).toBe(false);
  expect(shouldRecordClipboard({ ...settings, clipboardEnabled: false }, null, 201)).toBe(false);
});
it('按时间范围清理保护收藏，预览过期拒绝删除；OCR 删除竞态不重建记录', () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'nexlet-controls-'));
  store = new Store(directory);
  for (const [id, time, favorite] of [
    ['old', 100, false],
    ['favorite', 200, true],
    ['new', 300, false],
  ] as const)
    store.addClip({ id, kind: 'image', text: '图片', hash: id, createdAt: time, favorite });
  const preview = store.clipRange(0, 250, false);
  expect(preview.ids).toEqual(['old']);
  store.setClipOcr('old', 'old', 'Nexlet example');
  expect(store.clipIndex('example').ids).toEqual(['old']);
  expect(() => store.clearClipRange(0, 250, false, preview.revision)).toThrow();
  store.clearClipRange(0, 250, false, store.clipRange(0, 250, false).revision);
  expect(store.clips().map((item) => item.id)).toEqual(['new', 'favorite']);
  expect(store.setClipOcr('old', 'old', 'late')).toBe(false);
  expect(store.clip('old')).toBeUndefined();
});
