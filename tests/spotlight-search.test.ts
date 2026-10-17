import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), stat: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs/promises', () => ({ stat: mocks.stat }));
import { SpotlightSearch } from '../src/main/spotlight';

function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
}
function output(paths: string[]) {
  mocks.spawn.mockImplementationOnce(() => {
    const proc = child();
    queueMicrotask(() => {
      proc.stdout.end(paths.join('\0') + '\0');
      proc.emit('close', 0);
    });
    return proc;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.stat.mockResolvedValue({
    size: 42,
    mtime: new Date('2026-10-12T00:00:00Z'),
    isDirectory: () => false,
  });
});
describe('Spotlight 搜索后端', () => {
  it('空输入不启动进程', async () => {
    expect(await new SpotlightSearch(() => []).search(1, '')).toMatchObject({
      status: 'idle',
      items: [],
    });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('按目录查询、去重并忽略已删除文件，支持换行路径', async () => {
    output(['/tmp/资料/中文\n报告.pdf', '/tmp/资料/gone.pdf']);
    output(['/tmp/资料/中文\n报告.pdf']);
    mocks.stat.mockImplementation(async (file: string) => {
      if (file.endsWith('gone.pdf')) throw Error('ENOENT');
      return { size: 42, mtime: new Date('2026-10-12T00:00:00Z'), isDirectory: () => false };
    });
    const result = await new SpotlightSearch(() => ['/tmp/资料', '/tmp/资料/sub']).search(
      1,
      'ext:pdf',
    );
    expect(mocks.spawn.mock.calls[0].slice(0, 2)).toEqual([
      '/usr/bin/mdfind',
      ['-0', '-onlyin', '/tmp/资料', '(kMDItemFSName == "*.pdf"cd)'],
    ]);
    expect(result).toMatchObject({
      status: 'ready',
      limited: false,
      items: [{ path: '/tmp/资料/中文\n报告.pdf', name: '中文\n报告.pdf', size: 42 }],
    });
  });
  it('读取第 201 条后停止并只展示 200 条', async () => {
    output(Array.from({ length: 250 }, (_, i) => `/tmp/file-${i}.txt`));
    const result = await new SpotlightSearch(() => []).search(1, 'file');
    expect(result.items).toHaveLength(200);
    expect(result.limited).toBe(true);
    expect(mocks.spawn.mock.results[0].value.kill).toHaveBeenCalled();
  });
  it('新查询取消同窗口旧查询，不影响其他窗口', async () => {
    const first = child(),
      other = child();
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(other);
    output(['/tmp/new.txt']);
    const search = new SpotlightSearch(() => []),
      old = search.search(1, 'old'),
      independent = search.search(2, 'other');
    expect((await search.search(1, 'new')).items[0].path).toBe('/tmp/new.txt');
    expect((await old).items).toEqual([]);
    expect(first.kill).toHaveBeenCalled();
    expect(other.kill).not.toHaveBeenCalled();
    search.forget(2);
    expect((await independent).items).toEqual([]);
    expect(other.kill).toHaveBeenCalled();
  });
  it('超时终止查询并提供可重试错误', async () => {
    vi.useFakeTimers();
    try {
      const proc = child();
      mocks.spawn.mockReturnValue(proc);
      const result = new SpotlightSearch(() => []).search(1, 'slow');
      await vi.advanceTimersByTimeAsync(5000);
      expect(await result).toMatchObject({
        status: 'unavailable',
        message: expect.stringContaining('超时'),
      });
      expect(proc.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('进程失败不误报为空结果或索引中', async () => {
    mocks.spawn.mockImplementation(() => {
      const proc = child();
      queueMicrotask(() => proc.emit('error', Error('ENOENT')));
      return proc;
    });
    expect(await new SpotlightSearch(() => []).search(1, 'x')).toMatchObject({
      status: 'unavailable',
    });
  });
  it('读取文件信息卡住时仍遵守查询超时', async () => {
    vi.useFakeTimers();
    try {
      output(['/tmp/slow-metadata']);
      mocks.stat.mockReturnValue(new Promise(() => {}));
      const result = new SpotlightSearch(() => []).search(1, 'slow');
      await vi.advanceTimersByTimeAsync(5000);
      expect(await result).toMatchObject({
        status: 'unavailable',
        message: expect.stringContaining('超时'),
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('空结果提示系统索引边界', async () => {
    output([]);
    expect(await new SpotlightSearch(() => []).search(1, 'missing')).toMatchObject({
      status: 'ready',
      message: expect.stringContaining('Spotlight'),
      items: [],
    });
  });
});
