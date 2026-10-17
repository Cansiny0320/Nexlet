import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vite-plus/test';
import { Store } from '../src/main/store';
import type { ClipItem } from '../src/shared/types';

function fixture(run: (store: Store, directory: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nexlet-test-'));
  const store = new Store(directory);
  try {
    run(store, directory);
  } finally {
    try {
      store.close();
    } catch {
      /* a test may explicitly reopen */
    }
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith('nexlet-test-')
    )
      throw new Error('Unsafe test cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
}
const clip = (id: string, createdAt = Date.now()): ClipItem => ({
  id,
  kind: 'text',
  text: `测试 ${id}`,
  hash: id,
  createdAt,
  favorite: false,
});
describe('本机持久化', () => {
  it('旧设置默认开启自动检查，关闭后重启仍保持关闭', () =>
    fixture((s, dir) => {
      s.set('settings', { theme: 'dark' });
      expect(s.settings().autoCheckUpdates).toBe(true);
      s.set('settings', { ...s.settings(), autoCheckUpdates: false });
      s.close();
      const next = new Store(dir);
      try {
        expect(next.settings()).toMatchObject({ theme: 'dark', autoCheckUpdates: false });
      } finally {
        next.close();
      }
    }));
  it('重启保留稿纸与设置', () =>
    fixture((s, dir) => {
      const pads = s.pads();
      pads[0].lines[0].expression = '128*3';
      s.set('pads', pads);
      s.set('settings', { ...s.settings(), theme: 'dark' });
      s.close();
      const next = new Store(dir);
      expect(next.pads()[0].lines[0].expression).toBe('128*3');
      expect(next.settings().theme).toBe('dark');
      next.close();
    }));
  it('相同内容更新位置并保留收藏', () =>
    fixture((s) => {
      s.addClip(clip('a', 100));
      s.favorite('a', true);
      s.addClip({ ...clip('b', 200), hash: 'a' });
      expect(s.clips()).toHaveLength(1);
      expect(s.clips()[0]).toMatchObject({ id: 'a', favorite: true, createdAt: 200 });
    }));
  it('期限和容量清理不删除收藏', () =>
    fixture((s) => {
      s.set('settings', { ...s.settings(), maxClipboardItems: 1, retentionDays: 1 });
      s.addClip(clip('old', 1));
      s.favorite('old', true);
      s.addClip(clip('expired', 2));
      s.addClip(clip('one', Date.now() - 1000));
      s.addClip(clip('two'));
      s.prune();
      expect(s.clips().map((i) => i.id)).toEqual(['two', 'old']);
    }));
  it('参数化查询保留引号及中文', () =>
    fixture((s) => {
      s.addClip({ ...clip('quote'), text: "项目 'a'; DROP TABLE clips; --" });
      expect(s.clips('项目')).toHaveLength(1);
      expect(s.clips('其他')).toHaveLength(0);
    }));
});
