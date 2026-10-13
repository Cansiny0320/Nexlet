import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ functions: {} as Record<string, any>, load: vi.fn() }));
vi.mock('koffi', () => ({ default: { load: mocks.load } }));
let run: typeof import('../src/main/system-native-windows').windowsPowerAction;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  mocks.functions = {};
  mocks.load.mockImplementation(() => ({ func: (signature: string) => {
    const name = signature.match(/(\w+)\(/)![1];
    const fn = vi.fn().mockReturnValue(1);
    if (name === 'OpenProcessToken') fn.mockImplementation((_process, _flags, out) => { out[0] = 'token'; return 1; });
    if (name === 'GetLastError') fn.mockReturnValue(0);
    if (name === 'AdjustTokenPrivileges') fn.mockImplementation((_token, _all, _new, _size, previous) => { if (previous) previous.writeUInt32LE(1); return 1; });
    if (name === 'SetSuspendState') Object.assign(fn, { async: vi.fn((_hibernate, _force, _disableWake, callback) => callback(null, 1)) });
    mocks.functions[name] = fn; return fn;
  } }));
  run = (await import('../src/main/system-native-windows')).windowsPowerAction;
});
afterEach(() => vi.restoreAllMocks());
describe('Windows 原生睡眠权限与资源管理', () => {
  it('惰性加载，正确启用/还原权限，睡眠不变成休眠或禁用唤醒', async () => {
    expect(mocks.load).not.toHaveBeenCalled(); await run('sleep');
    const f = mocks.functions;
    expect(f.OpenProcessToken.mock.calls[0][1]).toBe(0x28);
    expect(f.LookupPrivilegeValueW.mock.calls[0].slice(0, 2)).toEqual([null, 'SeShutdownPrivilege']);
    const requested = f.AdjustTokenPrivileges.mock.calls[0][2] as Buffer;
    expect(requested.readUInt32LE(0)).toBe(1); expect(requested.readUInt32LE(12)).toBe(2);
    expect(f.SetSuspendState.async).toHaveBeenCalledWith(0, 0, 0, expect.any(Function));
    expect(f.AdjustTokenPrivileges.mock.calls[1][2]).toBe(f.AdjustTokenPrivileges.mock.calls[0][4]);
    expect(f.CloseHandle).toHaveBeenCalledWith('token');
  });
  it('没有睡眠权限时拒绝执行并关闭 token', async () => {
    await run('lock'); const f = mocks.functions;
    f.GetLastError.mockReturnValue(1300);
    await expect(run('sleep')).rejects.toThrow('1300');
    expect(f.SetSuspendState.async).not.toHaveBeenCalled(); expect(f.CloseHandle).toHaveBeenCalledWith('token');
  });
  it('系统拒绝睡眠时仍恢复权限并允许重试', async () => {
    await run('lock'); const f = mocks.functions;
    f.SetSuspendState.async.mockImplementationOnce((_a: number, _b: number, _c: number, cb: Function) => cb(null, 0));
    await expect(run('sleep')).rejects.toThrow('未接受睡眠请求');
    expect(f.AdjustTokenPrivileges).toHaveBeenCalledTimes(2); expect(f.CloseHandle).toHaveBeenCalledOnce();
    await run('sleep'); expect(f.CloseHandle).toHaveBeenCalledTimes(2);
  });
  it('锁屏检查 Win32 返回值；token 打开或查询失败不泄漏资源', async () => {
    await run('lock'); const f = mocks.functions;
    f.LockWorkStation.mockReturnValue(0); f.GetLastError.mockReturnValue(5);
    await expect(run('lock')).rejects.toThrow('错误 5');
    f.OpenProcessToken.mockReturnValue(0);
    await expect(run('sleep')).rejects.toThrow('错误 5'); expect(f.CloseHandle).not.toHaveBeenCalled();
    f.OpenProcessToken.mockImplementation((_p: unknown, _flags: number, out: unknown[]) => { out[0] = 'token'; return 1; });
    f.LookupPrivilegeValueW.mockReturnValue(0);
    await expect(run('sleep')).rejects.toThrow('错误 5'); expect(f.CloseHandle).toHaveBeenCalledWith('token');
  });
  it('恢复权限失败也报告错误并关闭 token', async () => {
    await run('lock'); const f = mocks.functions;
    f.AdjustTokenPrivileges.mockReturnValueOnce(1).mockReturnValueOnce(0);
    await expect(run('sleep')).rejects.toThrow('Windows 系统操作失败');
    expect(f.CloseHandle).toHaveBeenCalledWith('token');
  });
});
