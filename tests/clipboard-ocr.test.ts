import { expect, it } from 'vite-plus/test';
import { ClipboardOcr } from '../src/main/clipboard-ocr';
import type { ClipItem } from '../src/shared/types';
const image = (id: string): ClipItem => ({
  id,
  hash: id,
  kind: 'image',
  imagePath: '/tmp/' + id + '.png',
  text: 'Image',
  createdAt: 1,
  favorite: false,
});
it('串行执行、取消不写回、删除记录不会被迟到识别重建', async () => {
  const data = new Map(['a', 'b', 'c'].map((id) => [id, image(id)]));
  const writes: string[] = [];
  const pending: { id: string; finish: (value: string) => void }[] = [];
  const queue = new ClipboardOcr(
    {
      clip: async (id: string) => data.get(id),
      setClipOcr: async (id: string, _hash: string, text: string) => {
        if (!data.has(id)) return false;
        writes.push(id + ':' + text);
        return true;
      },
    },
    async (item, _signal) =>
      new Promise((resolve) => pending.push({ id: item.id, finish: resolve })),
    () => {},
  );
  await queue.enqueue(['a', 'b']);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(pending.map((item) => item.id)).toEqual(['a']);
  queue.cancel(['a']);
  pending[0].finish('late');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(pending.map((item) => item.id)).toEqual(['a', 'b']);
  data.delete('b');
  pending[1].finish('deleted');
  await queue.idle();
  expect(writes).toEqual([]);
  expect(queue.read().find((item) => item.id === 'a')?.status).toBe('cancelled');
  await queue.enqueue(['c']);
  await new Promise((resolve) => setTimeout(resolve, 0));
  pending[2].finish('hello');
  await queue.idle();
  expect(writes).toEqual(['c:hello']);
});
it('已有索引不重复自动排队，手动清除和重试可控', async () => {
  const item = { ...image('a'), ocrText: 'old' };
  const writes: string[] = [];
  const queue = new ClipboardOcr(
    {
      clip: async () => item,
      setClipOcr: async (_id: string, _hash: string, text: string) => {
        writes.push(text);
        return true;
      },
    },
    async () => 'new',
    () => {},
  );
  await queue.enqueue(['a'], true);
  await queue.idle();
  expect(writes).toEqual([]);
  await queue.enqueue(['a']);
  await queue.idle();
  expect(writes).toEqual(['new']);
  await queue.clear(['a']);
  expect(writes).toEqual(['new', '']);
  queue.close();
});
