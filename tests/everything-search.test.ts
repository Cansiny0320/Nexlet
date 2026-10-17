import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  version: vi.fn(),
  exec: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nexlet-test' },
  clipboard: { writeText: vi.fn() },
  shell: {},
}));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  readFile: mocks.readFile,
  stat: mocks.stat,
  unlink: mocks.unlink,
}));
vi.mock('../src/main/everything-engine', () => ({
  EverythingEngine: class {
    es = 'es.exe';
    instance = 'test';
    scopes = ['C:\\fixture'];
    ensure = mocks.ensure;
    version = mocks.version;
  },
}));
import { EverythingSearch } from '../src/main/everything';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ensure.mockResolvedValue('1.4.1.1032');
  mocks.version.mockResolvedValue('1.4.1.1032');
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.stat.mockResolvedValue({ size: 0 });
  mocks.readFile.mockResolvedValue('');
  mocks.unlink.mockResolvedValue(undefined);
  mocks.exec.mockImplementation((_file, _args, _options, callback) => callback(null, '', ''));
});
describe('Everything 查询状态', () => {
  it('空白输入不启动引擎、不发起查询', async () => {
    expect(await new EverythingSearch(() => [], 'win32').search(1, '  ')).toMatchObject({
      status: 'idle',
      items: [],
    });
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('ES Error 8 在实例仍有响应时表示等待首次索引，并能在后续查询恢复', async () => {
    mocks.exec.mockImplementationOnce((_f, _a, _o, callback) =>
      callback(
        Object.assign(new Error('IPC not found'), {
          code: 8,
          stderr: 'Error 8: Everything IPC not found.',
        }),
      ),
    );
    const search = new EverythingSearch(() => [], 'win32');
    expect(await search.search(1, 'report')).toMatchObject({ status: 'indexing', items: [] });
    expect(mocks.version).toHaveBeenCalled();
    expect(await search.search(1, 'report')).toMatchObject({ status: 'ready', items: [] });
  });
  it('ES Error 8 且引擎已经退出时明确提示引擎不可用', async () => {
    mocks.exec.mockImplementationOnce((_f, _a, _o, callback) =>
      callback(Object.assign(new Error('IPC not found'), { code: 8 })),
    );
    mocks.version.mockResolvedValue(null);
    expect(await new EverythingSearch(() => [], 'win32').search(1, 'report')).toMatchObject({
      status: 'unavailable',
      items: [],
    });
  });
  it('导出文件失败不误报为索引中', async () => {
    mocks.exec.mockImplementationOnce((_f, _a, _o, callback) =>
      callback(Object.assign(new Error('Export denied'), { code: 5 })),
    );
    await expect(new EverythingSearch(() => [], 'win32').search(1, 'report')).rejects.toThrow(
      '文件搜索失败',
    );
  });
});

describe('independent index preparation', () => {
  it('prepares on empty open without exporting search results', async () => {
    const search = new EverythingSearch(() => [], 'win32');
    expect(await search.status()).toMatchObject({ status: 'ready', scopes: ['C:\\fixture'] });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.exec.mock.calls[0][1]).toEqual(expect.arrayContaining(['-n', '0']));
  });
  it('shares in-flight readiness checks across windows', async () => {
    const search = new EverythingSearch(() => [], 'win32');
    await Promise.all([search.status(), search.status()]);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.exec).toHaveBeenCalledTimes(1);
  });
  it('keeps elapsed start time across slow checks and recovers', async () => {
    const search = new EverythingSearch(() => [], 'win32');
    mocks.exec.mockImplementation((_f, _a, _o, callback) =>
      callback(Object.assign(new Error('busy'), { code: 8 })),
    );
    const first = await search.status(),
      second = await search.status();
    expect(first.status).toBe('preparing');
    expect(second.startedAt).toBe(first.startedAt);
    mocks.exec.mockImplementation((_f, _a, _o, callback) => callback(null, '', ''));
    expect((await search.status()).status).toBe('ready');
  });
  it('reports disconnected engine separately from preparation', async () => {
    mocks.exec.mockImplementation((_f, _a, _o, callback) =>
      callback(Object.assign(new Error('gone'), { code: 8 })),
    );
    mocks.version.mockResolvedValue(null);
    expect((await new EverythingSearch(() => [], 'win32').status()).status).toBe('unavailable');
  });
  it('does not revoke file actions while checking readiness', async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify([{ filename: 'C:\\fixture\\report.txt', size: 1, attributes: 0 }]),
    );
    mocks.stat.mockResolvedValue({ size: 100 });
    const search = new EverythingSearch(() => [], 'win32');
    await search.search(1, 'report');
    await search.status();
    await expect(search.action(1, 'copy', 'C:\\fixture\\report.txt')).resolves.toBe(true);
  });
});
