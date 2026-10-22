import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

let application: ElectronApplication, directory: string;
test.beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nexlet-background-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [process.cwd()],
    env: env as Record<string, string>,
  });
  await expect((await application.firstWindow()).locator('.launcher-input')).toBeVisible();
});
test.afterEach(async () => {
  await application?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('真实 Worker 保留全文、取消旧查询，重启后拒绝旧分页版本', async () => {
  const result = await application.evaluate(async () => {
    const n = (globalThis as any).__nexlet;
    const full = '🙂'.repeat(800) + ' ÄBC 末尾';
    await n.clipStore.addClip({
      id: 'a',
      hash: 'a',
      kind: 'text',
      text: full,
      createdAt: Date.now(),
      favorite: false,
    });
    const index = await n.clipStore.clipIndex('äbc');
    const page = await n.clipStore.clipPage(index.ids, index.revision);
    const detail = await n.clipStore.clip('a');
    const queries = await Promise.allSettled([
      n.clipStore.clipIndex('not found', 'all', undefined, 77),
      n.clipStore.clipIndex('末尾', 'all', undefined, 77),
    ]);
    await n.clipStore.worker.terminate();
    await n.clipStore.favorite('a', true);
    const stale = await n.clipStore.clipPage(index.ids, index.revision);
    const next = await n.clipStore.clipIndex('', 'favorite');
    return {
      page,
      full: detail.text === full,
      last: queries[1].status === 'fulfilled' ? queries[1].value : null,
      stale,
      next,
    };
  });
  expect(result.full).toBe(true);
  expect(result.page.items[0].textLength).toBe(807);
  expect(result.page.items[0].text.length).toBe(600);
  expect(result.last.ids).toEqual(['a']);
  expect(result.stale.stale).toBe(true);
  expect(result.next.ids).toEqual(['a']);
});

test('专用 renderer 保留 PNG、透明度、hash 和缩略图，退出后按需重建', async () => {
  const result = await application.evaluate(async ({ nativeImage }) => {
    const n = (globalThis as any).__nexlet;
    const bitmap = Buffer.alloc(64 * 48 * 4);
    for (let i = 0; i < bitmap.length; i++) bitmap[i] = (i * 17) % 256;
    const input = nativeImage.createFromBitmap(bitmap, { width: 64, height: 48 }).toPNG();
    const original = nativeImage.createFromBuffer(input);
    const png = original.toPNG();
    const image = await n.clips.images.capture(new Uint8Array(input), n.clipStore.images);
    const copy = await n.clips.images.copy(image.imagePath);
    const empty = await n.clips.images.capture(new Uint8Array(), n.clipStore.images);
    n.clips.images.window.destroy();
    const reopened = await n.clips.images.capture(new Uint8Array(input), n.clipStore.images);
    return {
      image,
      reopened,
      empty,
      png: png.toString('base64'),
      copy: Buffer.from(copy).toString('base64'),
      thumbnail: original.resize({ width: 64 }).toDataURL(),
    };
  });
  const png = Buffer.from(result.png, 'base64');
  expect(result.image).toMatchObject({
    width: 64,
    height: 48,
    hash: createHash('sha256').update(png).digest('hex'),
    thumbnail: result.thumbnail,
  });
  expect(await readFile(result.image.imagePath)).toEqual(png);
  expect(result.copy).toBe(result.png);
  expect(result.empty).toBeNull();
  expect(result.reopened).toEqual(result.image);
});
