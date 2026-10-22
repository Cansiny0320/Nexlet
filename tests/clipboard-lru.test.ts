import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ClipItem } from '../src/shared/types';

const { writeText, write } = vi.hoisted(() => ({ writeText: vi.fn(), write: vi.fn() }));
vi.mock('electron', () => ({
  clipboard: { writeText, write },
  ClipboardItem: class {},
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => false, toPNG: () => Buffer.from('png') }),
  },
}));
vi.mock('../src/main/clipboard-image', () => ({
  ClipboardImages: class {
    async copy() {
      return new Uint8Array(Buffer.from('png'));
    }
    close() {}
  },
}));
import { ClipboardService } from '../src/main/clipboard';
import { Store } from '../src/main/store';

let store: Store, directory: string;
const changed = vi.fn(),
  writeFiles = vi.fn();
const clip = (id: string, createdAt: number, extra: Partial<ClipItem> = {}): ClipItem => ({
  id,
  text: id,
  hash: createHash('sha256')
    .update('text:' + id)
    .digest('hex'),
  kind: 'text',
  createdAt,
  favorite: false,
  ...extra,
});
const service = () =>
  new ClipboardService(store, { sequence: () => 1, writeFiles } as any, changed);
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nexlet-lru-'));
  store = new Store(directory);
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  write.mockResolvedValue(undefined);
  writeFiles.mockResolvedValue(undefined);
});
afterEach(() => {
  store.close();
  if (
    path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith('nexlet-lru-')
  )
    throw new Error('Unsafe test cleanup');
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it.each(['text', 'image', 'files'] as const)(
  '%s reuse moves to the front and persists without losing metadata',
  async (kind) => {
    const file = path.join(store.images, 'fixture.png');
    writeFileSync(file, 'fixture');
    store.addClip(
      clip('old', 100, {
        kind,
        favorite: true,
        imagePath: kind === 'image' ? file : undefined,
        files: kind === 'files' ? [file] : undefined,
      }),
    );
    store.addClip(clip('new', 200));
    const original = store.clip('old')!;
    await service().copy(['old']);
    expect(store.clips().map((item) => item.id)).toEqual(['old', 'new']);
    expect(store.clip('old')).toEqual({ ...original, createdAt: expect.any(Number) });
    expect(store.clip('old')!.createdAt).toBeGreaterThan(200);
    expect(changed).toHaveBeenCalledOnce();
    store.close();
    store = new Store(directory);
    expect(store.clips().map((item) => item.id)).toEqual(['old', 'new']);
  },
);

it('batch reuse preserves selection order and repeated reuse in the same millisecond remains LRU', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  store.addClip(clip('a', 100));
  store.addClip(clip('b', 200));
  store.addClip(clip('c', 300));
  const clips = service();
  await clips.copy(['a', 'b']);
  expect(writeText).toHaveBeenLastCalledWith('a\nb');
  expect(store.clips().map((item) => item.id)).toEqual(['a', 'b', 'c']);
  await clips.copy(['c']);
  expect(store.clips().map((item) => item.id)).toEqual(['c', 'a', 'b']);
  store.set('settings', { ...store.settings(), maxClipboardItems: 2 });
  store.prune(1000);
  expect(store.clips().map((item) => item.id)).toEqual(['c', 'a']);
  store.addClip(clip('fresh', 1000));
  expect(store.clips().map((item) => item.id)).toEqual(['fresh', 'c', 'a']);
});

it('failed clipboard writes leave ordering and timestamps unchanged', async () => {
  store.addClip(clip('old', 100));
  store.addClip(clip('new', 200));
  const before = store.clips();
  writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
  await expect(service().copy(['old'])).rejects.toThrow('clipboard unavailable');
  expect(store.clips()).toEqual(before);
  expect(changed).not.toHaveBeenCalled();
});
