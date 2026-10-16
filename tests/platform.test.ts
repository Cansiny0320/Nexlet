import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { accessibility, runCommand } = vi.hoisted(() => ({
  accessibility: vi.fn(),
  runCommand: vi.fn()
}));
vi.mock('electron', () => ({ systemPreferences: { isTrustedAccessibilityClient: accessibility } }));
vi.mock('node:util', () => ({ promisify: () => runCommand }));
vi.mock('koffi', () => ({ default: {} }));

import { Platform } from '../src/main/platform';

describe('macOS 自动回贴权限', () => {
  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    accessibility.mockReset().mockReturnValue(false);
    runCommand.mockReset().mockResolvedValue({ stdout: '42' });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('缺少权限时请求系统授权引导，并停止回贴、保留手动粘贴提示', async () => {
    const platform = new Platform(() => undefined);
    platform.target = { pid: 42 };

    await expect(platform.paste()).rejects.toThrow('内容已复制，可手动粘贴');
    expect(accessibility).toHaveBeenCalledWith(true);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('授权后再次回贴会重新检查权限并执行粘贴', async () => {
    const platform = new Platform(() => undefined);
    platform.target = { pid: 42 };
    await expect(platform.paste()).rejects.toThrow('辅助功能');

    accessibility.mockReturnValue(true);
    await expect(platform.paste()).resolves.toBeUndefined();
    expect(accessibility).toHaveBeenCalledTimes(2);
    expect(runCommand).toHaveBeenLastCalledWith('/usr/bin/osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'], { timeout: 5000 });
  });

  it('初始化和没有目标窗口时不会请求权限', async () => {
    const platform = new Platform(() => undefined);
    expect(accessibility).not.toHaveBeenCalled();
    await expect(platform.paste()).rejects.toThrow('没有可回贴的目标窗口');
    expect(accessibility).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('唤起优先使用原生目标，并在 Nexlet 已处于前台时保留原目标', async () => {
    const target = vi.fn().mockResolvedValueOnce({ pid: 321 }).mockResolvedValueOnce(null);
    const platform = new Platform(() => undefined, target);
    await platform.rememberTarget();
    expect(platform.target).toEqual({ pid: 321 });
    await platform.rememberTarget();
    expect(platform.target).toEqual({ pid: 321 });
    expect(runCommand).not.toHaveBeenCalled();
    expect(accessibility).not.toHaveBeenCalled();
  });

  it('原生读取失败后回退 JXA，并忽略本进程目标', async () => {
    const platform = new Platform(() => undefined, async () => { throw Error('native unavailable'); });
    runCommand.mockResolvedValueOnce({ stdout: '{"pid":123}' });
    await platform.rememberTarget();
    expect(platform.target).toEqual({ pid: 123 });
    runCommand.mockResolvedValueOnce({ stdout: JSON.stringify({ pid: process.pid }) });
    await platform.rememberTarget();
    expect(platform.target).toEqual({ pid: 123 });
  });
});
