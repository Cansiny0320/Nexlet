import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  execute: vi.fn(), initialize: vi.fn(), uninitialize: vi.fn(), lastError: vi.fn()
}));
vi.mock('koffi', () => ({ default: {
  struct: (value: unknown) => value, sizeof: () => 112,
  pointer: (value: unknown) => value, inout: (value: unknown) => value,
  load: () => ({ func: (...args: string[]) => {
    const declaration = args.join(' ');
    if (declaration.includes('ShellExecuteExW')) return native.execute;
    if (declaration.includes('CoInitializeEx')) return native.initialize;
    if (declaration.includes('CoUninitialize')) return native.uninitialize;
    if (declaration.includes('GetLastError')) return native.lastError;
    throw new Error('Unexpected native function');
  } })
} }));
import { launchWindowsApplication } from '../src/main/launch-windows';

const appId = 'Example.App_123456789abcd!App';
beforeEach(() => {
  vi.resetAllMocks();
  native.initialize.mockReturnValue(0);
  native.execute.mockReturnValue(1);
});

describe('Windows application launch result', () => {
  it('accepts a successful Shell activation without relying on an Explorer process', () => {
    expect(() => launchWindowsApplication(appId)).not.toThrow();
    expect(native.execute).toHaveBeenCalledWith(expect.objectContaining({ lpFile: `shell:AppsFolder\\${appId}`, fMask: 0x500 }));
    expect(native.lastError).not.toHaveBeenCalled();
    expect(native.uninitialize).toHaveBeenCalledTimes(1);
  });
  it.each([2, 3, 5, 1223, 31])('preserves real Shell failure %i', code => {
    native.execute.mockReturnValue(0);
    native.lastError.mockReturnValue(code);
    expect(() => launchWindowsApplication(appId)).toThrow(`Windows 错误 ${code}`);
    expect(native.uninitialize).toHaveBeenCalledTimes(1);
  });
  it('balances an already initialized STA apartment', () => {
    native.initialize.mockReturnValue(1);
    launchWindowsApplication(appId);
    expect(native.uninitialize).toHaveBeenCalledTimes(1);
  });
  it('does not uninitialize an existing incompatible apartment', () => {
    native.initialize.mockReturnValue(0x80010106 | 0);
    launchWindowsApplication(appId);
    expect(native.execute).toHaveBeenCalledTimes(1);
    expect(native.uninitialize).not.toHaveBeenCalled();
  });
  it('reports COM initialization failures without attempting a launch', () => {
    native.initialize.mockReturnValue(0x80004005 | 0);
    expect(() => launchWindowsApplication(appId)).toThrow('HRESULT 0x80004005');
    expect(native.execute).not.toHaveBeenCalled();
    expect(native.uninitialize).not.toHaveBeenCalled();
  });
  it.each(['', 'uwp:' + appId, appId + '\\file', appId + '\0', 'https://example.com'])('rejects an invalid app identifier %j', id => {
    expect(() => launchWindowsApplication(id)).toThrow('应用标识无效');
    expect(native.initialize).not.toHaveBeenCalled();
  });
});
