import { describe, expect, it } from 'vitest';
import { ToolDrafts } from '../src/main/tool-drafts';

describe('tool drafts', () => {
  function fixture() {
    const data = new Map<string, unknown>();
    let restore = false;
    const store = {
      get: <T>(key: string, fallback: T) => (data.get(key) ?? fallback) as T,
      set: (key: string, value: unknown) => {
        data.set(key, structuredClone(value));
      },
      settings: () => ({ restoreToolSessions: restore }),
    };
    return {
      store,
      data,
      enable: () => {
        restore = true;
      },
    };
  }
  it('keeps drafts only in the current run by default and clones values', () => {
    const { store } = fixture(),
      drafts = new ToolDrafts(store);
    drafts.save('main:json', { input: '你好', output: 'result' });
    const read = drafts.read('main:json')!;
    read.input = 'changed';
    expect(drafts.read('main:json')?.input).toBe('你好');
    expect(new ToolDrafts(store).read('main:json')).toBeNull();
  });
  it('persists only opted-in main-window drafts, and clear removes persisted data', () => {
    const { store, enable } = fixture();
    enable();
    const drafts = new ToolDrafts(store);
    drafts.save('main:json', { output: 'kept' });
    drafts.save('window:2:json', { output: 'isolated' });
    const restarted = new ToolDrafts(store);
    expect(restarted.read('main:json')?.output).toBe('kept');
    expect(restarted.read('window:2:json')).toBeNull();
    restarted.clear();
    expect(new ToolDrafts(store).read('main:json')).toBeNull();
  });
  it('rejects oversized and invalid snapshots without destroying the previous draft', () => {
    const { store } = fixture(),
      drafts = new ToolDrafts(store);
    drafts.save('main:json', { input: 'valid' });
    expect(() => drafts.save('main:json', ['invalid'])).toThrow();
    expect(() => drafts.save('main:json', { input: 'x'.repeat(4_000_001) })).toThrow();
    expect(drafts.read('main:json')?.input).toBe('valid');
  });
});

import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
it('跨重启的图片草稿总量仍受 64 MB 限制，清除删除本地文件', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-draft-images-'));
  const data = new Map<string, unknown>();
  const store = {
    directory,
    get: <T>(key: string, fallback: T) => (data.get(key) ?? fallback) as T,
    set: (key: string, value: unknown) => {
      data.set(key, value);
    },
    settings: () => ({ restoreToolSessions: true }),
  };
  try {
    const first = new ToolDrafts(store),
      bytes = new Uint8Array(17 * 1024 * 1024);
    await first.saveResource('main:a', bytes);
    await first.saveResource('main:b', bytes);
    await first.saveResource('main:c', bytes);
    const restarted = new ToolDrafts(store);
    await restarted.saveResource('main:d', bytes);
    expect(await restarted.readResource('main:a')).toBeNull();
    expect(data.get('tool-draft-resource-keys') as string[]).toEqual([
      'main:b',
      'main:c',
      'main:d',
    ]);
    await restarted.clear();
    expect(await readdir(path.join(directory, 'tool-draft-resources'))).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
