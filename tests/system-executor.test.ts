import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  power: vi.fn(),
  trusted: vi.fn(),
  open: vi.fn(),
}));
vi.mock('node:util', () => ({ promisify: () => mocks.exec }));
vi.mock('electron', () => ({
  shell: { openExternal: mocks.open },
  systemPreferences: { isTrustedAccessibilityClient: mocks.trusted },
}));
vi.mock('../src/main/system-native-windows', () => ({ windowsPowerAction: mocks.power }));
import { createSystemExecutor } from '../src/main/system-executor';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exec.mockResolvedValue({ stdout: '' });
  mocks.power.mockResolvedValue(undefined);
});
describe('平台系统执行参数与失败行为（不调用真实系统操作）', () => {
  it('macOS 睡眠和桌面分别走固定程序，关机不包含强制参数', async () => {
    const executor = createSystemExecutor('darwin');
    await executor.execute('sleep');
    expect(mocks.exec).toHaveBeenLastCalledWith('/usr/bin/pmset', ['sleepnow'], expect.anything());
    await executor.execute('desktop');
    expect(mocks.exec).toHaveBeenLastCalledWith(
      '/System/Applications/Mission Control.app/Contents/MacOS/Mission Control',
      ['1'],
      expect.anything(),
    );
    for (const [action, phrase] of [
      ['shutdown', 'shut down'],
      ['restart', 'restart'],
      ['logout', 'log out'],
    ] as const) {
      await executor.execute(action);
      expect(mocks.exec).toHaveBeenLastCalledWith(
        '/usr/bin/osascript',
        ['-e', `tell application "System Events" to ${phrase}`],
        expect.anything(),
      );
    }
  });
  it('macOS 锁屏缺少权限明确失败，有权限使用固定按键脚本', async () => {
    const executor = createSystemExecutor('darwin');
    await expect(executor.execute('lock')).rejects.toThrow('辅助功能权限');
    expect(mocks.trusted).toHaveBeenCalledWith(false);
    expect(mocks.exec).not.toHaveBeenCalled();
    mocks.trusted.mockReturnValue(true);
    await executor.execute('lock');
    expect(mocks.exec.mock.calls[0][1][1]).toContain('control down, command down');
  });
  it('Windows 睡眠走原生 API，shutdown 参数不强制关闭应用', async () => {
    const executor = createSystemExecutor('win32');
    for (const action of ['sleep', 'lock'] as const) {
      await executor.execute(action);
      expect(mocks.power).toHaveBeenLastCalledWith(action);
    }
    expect(mocks.exec).not.toHaveBeenCalled();
    for (const [action, args] of [
      ['shutdown', ['/s', '/t', '0']],
      ['restart', ['/r', '/t', '0']],
      ['logout', ['/l']],
    ] as const) {
      await executor.execute(action);
      expect(mocks.exec).toHaveBeenLastCalledWith(
        expect.stringMatching(/System32\\shutdown\.exe$/),
        args,
        expect.objectContaining({ windowsHide: true }),
      );
    }
    await executor.execute('desktop');
    expect(mocks.exec.mock.calls.at(-1)![1].at(-1)).toContain('ToggleDesktop()');
  });
  it('进程和 URI 失败向上抛出，不启动 shell 拼接用户输入', async () => {
    mocks.exec.mockRejectedValue(Error('access denied'));
    await expect(createSystemExecutor('darwin').execute('sleep')).rejects.toThrow('access denied');
    mocks.open.mockRejectedValue(Error('unsupported URI'));
    await expect(createSystemExecutor('win32').open('ms-settings:sound')).rejects.toThrow(
      'unsupported URI',
    );
    await expect(createSystemExecutor('linux').execute('sleep')).rejects.toThrow('不支持');
    expect(mocks.exec.mock.calls.every((call) => !call[2].shell)).toBe(true);
  });
});
