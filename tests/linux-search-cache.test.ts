import { afterEach, expect, it, vi } from 'vite-plus/test';
import { mkdtemp, mkdir, writeFile, rm, rename, symlink, opendir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LinuxFileSearch } from '../src/main/linux-search';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'nexlet-dir-cache-'));
  roots.push(root);
  const io = {
    opendir: vi.fn((file: string) => opendir(file)),
    lstat: vi.fn((file: string) => lstat(file)),
  };
  return { root, io, search: new LinuxFileSearch(() => [root], io) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it('未变化目录不重复读取，但命中文件的 metadata 每次更新', async () => {
  const { root, io, search } = await fixture();
  await mkdir(path.join(root, 'child'));
  const file = path.join(root, 'child', 'report.txt');
  await writeFile(file, 'first');
  expect((await search.search(1, 'report')).items[0].size).toBe(5);
  expect(io.opendir).toHaveBeenCalledTimes(2);
  await writeFile(file, 'longer content');
  expect((await search.search(1, 'report')).items[0].size).toBe(14);
  expect(io.opendir).toHaveBeenCalledTimes(2);
  expect(io.lstat.mock.calls.filter(([value]) => value === file)).toHaveLength(2);
});

it('新增、删除、目录替换和祖先消失均重新发现，不跟随替换后的 symlink', async () => {
  const { root, search } = await fixture();
  const child = path.join(root, 'child');
  await mkdir(child);
  await writeFile(path.join(child, 'old.txt'), '');
  expect((await search.search(1, 'ext:txt')).items.map((item) => item.name)).toEqual(['old.txt']);
  await rm(child, { recursive: true });
  await mkdir(child);
  await writeFile(path.join(child, 'new.txt'), '');
  expect((await search.search(1, 'ext:txt')).items.map((item) => item.name)).toEqual(['new.txt']);
  await rename(child, path.join(root, '.hidden'));
  await symlink(
    path.join(root, '.hidden'),
    child,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect((await search.search(1, 'ext:txt')).items).toEqual([]);
  await rm(root, { recursive: true });
  expect((await search.search(1, 'new')).status).toBe('unavailable');
});

it('达到结果上限的部分目录不会当成完整缓存，reset 清理目录缓存', async () => {
  const { root, io, search } = await fixture();
  await Promise.all(
    Array.from({ length: 205 }, (_, i) => writeFile(path.join(root, `match-${i}.txt`), '')),
  );
  expect((await search.search(1, 'match')).limited).toBe(true);
  expect((await search.search(1, 'match-204.txt')).items).toHaveLength(1);
  expect(io.opendir).toHaveBeenCalledTimes(2);
  await search.search(1, 'nothing');
  expect(io.opendir).toHaveBeenCalledTimes(2);
  search.reset();
  await search.search(1, 'nothing');
  expect(io.opendir).toHaveBeenCalledTimes(3);
});
