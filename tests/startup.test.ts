import { describe, expect, it, vi } from 'vite-plus/test';
import { StartupManager } from '../src/main/startup';
import { setLocale } from '../src/shared/i18n';

function fixture(platform = 'win32', portable = 'D:\\Apps\\Nexlet 0.2.1.exe', packaged = true) {
  let saved: Record<string, any> = { openAtLogin: false, executableWillLaunchAtLogin: false };
  const host = {
    isPackaged: packaged,
    getLoginItemSettings: vi.fn(() => saved),
    setLoginItemSettings: vi.fn((options: any) => {
      saved = { ...options, executableWillLaunchAtLogin: options.openAtLogin };
    }),
  };
  const manager = new StartupManager(
    host as any,
    platform,
    'C:\\Temp\\unpacked\\Nexlet.exe',
    portable,
  );
  return {
    host,
    manager,
    override: (value: Record<string, any>) => {
      saved = value;
    },
  };
}

describe('系统登录自启动', () => {
  it.each(['en', 'zh-Hant'] as const)('macOS 待批准状态不依赖 %s 提示文本', (locale) => {
    const { host, manager, override } = fixture('darwin');
    override({ openAtLogin: false, status: 'requires-approval' });
    host.setLoginItemSettings.mockImplementation(() => {});
    setLocale(locale);
    try {
      expect(manager.set(true)).toMatchObject({
        supported: true,
        enabled: false,
        reason: expect.any(String),
      });
    } finally {
      setLocale('zh-CN');
    }
  });
  it('只在用户操作时写入，并注册稳定的便携 EXE，而不是临时解压进程', () => {
    const { host, manager } = fixture();
    expect(manager.read().enabled).toBe(false);
    expect(host.setLoginItemSettings).not.toHaveBeenCalled();
    expect(manager.set(true).enabled).toBe(true);
    expect(host.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      enabled: true,
      name: 'app.nexlet.desktop',
      path: 'D:\\Apps\\Nexlet 0.2.1.exe',
      args: ['--autostart'],
    });
    expect(host.getLoginItemSettings).toHaveBeenLastCalledWith({
      path: 'D:\\Apps\\Nexlet 0.2.1.exe',
      args: ['--autostart'],
    });
    expect(manager.set(false).enabled).toBe(false);
  });
  it('系统禁用或拒绝时不会把开关显示为已开启', () => {
    const { host, manager, override } = fixture();
    override({ openAtLogin: true, executableWillLaunchAtLogin: false });
    expect(manager.read().enabled).toBe(false);
    host.setLoginItemSettings.mockImplementation(() => {});
    expect(() => manager.set(true)).toThrow('系统');
  });
  it('macOS 待批准状态反馈给用户，按登录启动时隐藏主窗口', () => {
    const { host, manager, override } = fixture('darwin');
    override({ openAtLogin: false, status: 'requires-approval', wasOpenedAtLogin: true });
    host.setLoginItemSettings.mockImplementation(() => {});
    expect(manager.set(true)).toMatchObject({
      enabled: false,
      reason: expect.stringContaining('系统设置'),
    });
    expect(manager.wasOpenedAtLogin([])).toBe(true);
    expect(host.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });
  it('开发模式与不支持的平台不会注册 Electron 开发进程', () => {
    for (const value of [fixture('win32', undefined, false), fixture('linux')]) {
      expect(value.manager.read().supported).toBe(false);
      expect(() => value.manager.set(true)).toThrow();
      expect(value.host.setLoginItemSettings).not.toHaveBeenCalled();
    }
  });
  it('普通启动显示窗口，--autostart 启动保持后台', () => {
    const { manager } = fixture();
    expect(manager.wasOpenedAtLogin(['Nexlet.exe'])).toBe(false);
    expect(manager.wasOpenedAtLogin(['Nexlet.exe', '--autostart'])).toBe(true);
  });
});
