import { describe, expect, it } from 'vite-plus/test';
import { systemCommands } from '../src/main/system-commands';
import { searchCommands } from '../src/shared/search';

describe('系统关键词矩阵', () => {
  for (const platform of ['darwin', 'win32'] as const) {
    const commands = systemCommands(platform, platform === 'darwin' ? '25.5.0' : '10.0.22631');
    it.each([
      ['显示器', 'display'],
      ['声音', 'sound'],
      ['网络', 'network'],
      ['蓝牙', 'bluetooth'],
      ['打印机', 'printers'],
      ['键盘', 'keyboard'],
      ['鼠标', 'mouse'],
      ['触控板', 'trackpad'],
      ['辅助功能', 'accessibility'],
      ['隐私', 'privacy'],
      ['更新', 'update'],
      ['启动项', 'startup'],
      ['bluetooth', 'bluetooth'],
      ['Bluetooth Settings', 'bluetooth'],
      ['lanyashezhi', 'bluetooth'],
      ['lysz', 'bluetooth'],
      ['打字', 'keyboard'],
    ])(`${platform} 搜索 %s`, (query, suffix) => {
      expect(searchCommands(commands, query).map((c) => c.id)).toContain(
        'system:settings:' + suffix,
      );
    });
    it.each([
      ['睡眠', 'sleep'],
      ['Sleep', 'sleep'],
      ['shuimian', 'sleep'],
      ['sm', 'sleep'],
      ['锁屏', 'lock'],
      ['lock screen', 'lock'],
      ['lockscreen', 'lock'],
      ['suoping', 'lock'],
      ['重启', 'restart'],
      ['Reboot', 'restart'],
      ['Restart', 'restart'],
      ['cq', 'restart'],
      ['关机', 'shutdown'],
      ['shutdown', 'shutdown'],
      ['注销', 'logout'],
      ['sign out', 'logout'],
      ['显示桌面', 'desktop'],
      ['showdesktop', 'desktop'],
      ['Show Desktop', 'desktop'],
    ])(`${platform} 动作 %s 优先于设置`, (query, action) => {
      expect(searchCommands(commands, query)[0]?.id).toBe('system:action:' + action);
    });
    it(`${platform} 电源设置与睡眠操作是不同结果`, () => {
      expect(searchCommands(commands, '电源')[0]?.id).toBe('system:settings:power');
      expect(searchCommands(commands, '睡眠').map((c) => c.id)).toEqual(
        expect.arrayContaining(['system:action:sleep', 'system:settings:power']),
      );
    });
  }
  it('按平台和 Windows 版本过滤，设置 URI 不能落入其他平台', () => {
    expect(systemCommands('linux', '6.0')).toEqual([]);
    const mac = systemCommands('darwin', '25.5');
    const win = systemCommands('win32', '10.0.22631');
    expect(
      mac.filter((c) => c.url).every((c) => c.url!.startsWith('x-apple.systempreferences:')),
    ).toBe(true);
    expect(win.filter((c) => c.url).every((c) => c.url!.startsWith('ms-settings:'))).toBe(true);
    expect(win.some((c) => c.url === 'ms-settings:tabletmode')).toBe(false);
    expect(
      systemCommands('win32', '10.0.19045').some((c) => c.url === 'ms-settings:tabletmode'),
    ).toBe(true);
    expect(new Set(mac.map((c) => c.id)).size).toBe(mac.length);
    expect(new Set(win.map((c) => c.id)).size).toBe(win.length);
  });
  it.each([
    ['程序和功能', 'apps'],
    ['网络代理', 'proxy'],
    ['检测系统更新', 'update'],
  ])('Windows 特有设置的代表性别名 %s', (query, suffix) => {
    expect(searchCommands(systemCommands('win32', '10.0.22631'), query).map((c) => c.id)).toContain(
      'system:settings:' + suffix,
    );
  });
  it.each([
    ['程序坞', 'desktop'],
    ['备份', 'timemachine'],
    ['接力', 'airdrop'],
  ])('macOS 特有设置的代表性别名 %s', (query, suffix) => {
    expect(searchCommands(systemCommands('darwin', '25.5'), query).map((c) => c.id)).toContain(
      'system:settings:' + suffix,
    );
  });
  it('本地化后英文别名仍支持分词、连续输入，中文别名支持拼音', () => {
    const commands = [
      {
        id: 'fixture',
        name: '系统设置',
        subtitle: '',
        kind: 'app' as const,
        keywords: ['System Settings', '系统偏好设置'],
      },
    ];
    for (const q of [
      'System Settings',
      'systemsettings',
      'xitongshezhi',
      'xtsz',
      'xitongpianhaoshezhi',
      'xtphsz',
    ]) {
      expect(searchCommands(commands, q)[0]?.id, q).toBe('fixture');
    }
  });
});
