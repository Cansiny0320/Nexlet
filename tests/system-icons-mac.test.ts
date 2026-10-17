import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => run }));
vi.mock('node:os', () => ({ release: () => '25.0.0' }));
import { loadMacSystemIcons } from '../src/main/system-icons-mac';

beforeEach(() => {
  run.mockReset();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
});
afterEach(() => vi.restoreAllMocks());
it('只接受已注册设置的 PNG 图标，未知条目和缺失资源不会覆盖兜底', async () => {
  run.mockResolvedValue({
    stdout: JSON.stringify([
      ['system:settings:display', 'data:image/png;base64,native'],
      ['system:settings:sound', ''],
      ['system:settings:unknown', 'data:image/png;base64,unexpected'],
    ]),
  });
  expect(await loadMacSystemIcons()).toEqual(
    new Map([['system:settings:display', 'data:image/png;base64,native']]),
  );
  const [command, args] = run.mock.calls[0];
  expect(command).toBe('/usr/bin/osascript');
  expect(JSON.parse(args.at(-1))).toContainEqual([
    'system:settings:display',
    'com.apple.Displays-Settings.extension',
  ]);
});
it('进程失败或输出不可解析时保留兜底，不影响搜索', async () => {
  run.mockRejectedValueOnce(Error('timeout')).mockResolvedValueOnce({ stdout: 'invalid JSON' });
  expect(await loadMacSystemIcons()).toEqual(new Map());
  expect(await loadMacSystemIcons()).toEqual(new Map());
});
it('Windows 不启动 macOS 图标进程', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  expect(await loadMacSystemIcons()).toEqual(new Map());
  expect(run).not.toHaveBeenCalled();
});
