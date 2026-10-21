import { t } from '../shared/i18n';
import { commandNames } from '../shared/localized-command';
import type { Command } from '../shared/types';

export type SystemAction = 'lock' | 'sleep' | 'restart' | 'shutdown' | 'logout' | 'desktop';
export interface SystemCommand extends Command {
  url?: string;
  action?: SystemAction;
  confirm?: boolean;
}
interface Setting {
  id: string;
  name: string;
  target: string;
  keywords: string[];
  minBuild?: number;
  maxBuild?: number;
}
const setting = (
  id: string,
  name: string,
  target: string,
  keywords: string[],
  versions: Pick<Setting, 'minBuild' | 'maxBuild'> = {},
): Setting => ({ id, name, target, keywords, ...versions });

// URI reference: https://learn.microsoft.com/windows/apps/develop/launch/launch-settings
const windowsSettings: Setting[] = [
  setting('home', '系统设置', '', ['Windows Settings', '设置']),
  setting('about', '电脑信息', 'about', ['about', '系统信息', '关于本机']),
  setting('display', '显示器设置', 'display', ['display settings', '屏幕', '分辨率', '亮度']),
  setting('storage', '存储设置', 'storagesense', ['storage settings', '磁盘空间']),
  setting('focus', '专注助手设置', 'quietmomentshome', ['focus assist', '勿扰'], {
    maxBuild: 21999,
  }),
  setting('focus', '专注设置', 'quietmomentshome', ['focus', '专注助手'], { minBuild: 22000 }),
  setting('multitasking', '多任务设置', 'multitasking', ['multitasking', '窗口']),
  setting('project', '投影到此电脑设置', 'project', ['projection', '投屏']),
  setting('crossdevice', '共享体验设置', 'crossdevice', ['shared experiences'], {
    maxBuild: 21999,
  }),
  setting('tabletmode', '平板模式设置', 'tabletmode', ['tablet mode'], { maxBuild: 21999 }),
  setting('taskbar', '任务栏设置', 'taskbar', ['taskbar']),
  setting('notifications', '通知设置', 'notifications', ['notifications', '通知和操作']),
  setting('remotedesktop', '远程桌面设置', 'remotedesktop', ['remote desktop', 'rdp']),
  setting('power', '电源和睡眠设置', 'powersleep', ['power settings', 'sleep settings', '电池']),
  setting('sound', '声音设置', 'sound', ['sound settings', '声音播放', '音量', '扬声器', '麦克风']),
  setting('workplace', '工作或学校账户设置', 'workplace', [
    'work school account',
    '访问工作单位或学校',
  ]),
  setting('email', '电子邮件和应用账户设置', 'emailandaccounts', ['email accounts']),
  setting('users', '家庭和其他用户设置', 'otherusers', [
    'family other users',
    '家庭成员使用此电脑',
  ]),
  setting('signin', '登录选项设置', 'signinoptions', ['sign in options', '密码', '指纹']),
  setting('sync', '同步个性化设置', 'sync', ['sync settings'], { maxBuild: 21999 }),
  setting('account', '账户设置', 'yourinfo', ['account settings', '个人资料']),
  setting('apps', '应用和功能', 'appsfeatures', [
    'apps features',
    '程序和功能',
    '卸载',
    '已安装应用',
  ]),
  setting('webapps', '网站默认应用设置', 'appsforwebsites', ['apps for websites']),
  setting('defaultapps', '默认应用设置', 'defaultapps', ['default apps', '默认浏览器']),
  setting('maps', '离线地图设置', 'maps', ['offline maps']),
  setting('startup', '开机启动设置', 'startupapps', ['startup apps', '启动项', '登录项', '自启动']),
  setting('video', '视频播放设置', 'videoplayback', ['video playback']),
  setting('autoplay', '自动播放设置', 'autoplay', ['autoplay']),
  setting('bluetooth', '蓝牙设置', 'bluetooth', ['bluetooth settings', '蓝牙或其他设备']),
  setting('mouse', '鼠标设置', 'mousetouchpad', ['mouse settings']),
  setting('trackpad', '触摸板设置', 'devices-touchpad', [
    'touchpad settings',
    'trackpad',
    '触控板',
  ]),
  setting('pen', '笔设置', 'pen', ['pen ink', '手写笔']),
  setting('printers', '打印机与扫描仪设置', 'printers', ['printers scanners settings']),
  setting('typing', '输入设置', 'typing', ['typing', '输入法']),
  setting('usb', 'USB 设置', 'usb', ['usb devices']),
  setting('accessibility', '辅助功能设置', 'easeofaccess', [
    'accessibility settings',
    '轻松使用',
    '无障碍',
  ]),
  setting('audio', '辅助音频设置', 'easeofaccess-audio', ['accessibility audio', '音频设置']),
  setting('captions', '字幕设置', 'easeofaccess-closedcaptioning', [
    'closed captions',
    '隐藏式字幕',
  ]),
  setting('colorfilter', '颜色滤镜设置', 'easeofaccess-colorfilter', ['color filters', '色盲']),
  setting('accessibility-display', '辅助显示设置', 'easeofaccess-display', [
    'accessibility display',
    '文字大小',
  ]),
  setting('contrast', '高对比度设置', 'easeofaccess-highcontrast', ['high contrast']),
  setting('keyboard', '键盘设置', 'easeofaccess-keyboard', ['keyboard settings', '打字', '粘滞键']),
  setting('magnifier', '放大镜设置', 'easeofaccess-magnifier', ['magnifier']),
  setting('mousekeys', '键盘控制鼠标设置', 'easeofaccess-mouse', ['mouse keys']),
  setting('narrator', '讲述人设置', 'easeofaccess-narrator', ['narrator', '屏幕阅读']),
  setting('speechrecognition', '语音交互设置', 'easeofaccess-speechrecognition', [
    'speech recognition',
    '语音访问',
  ]),
  setting('fonts', '字体设置', 'fonts', ['fonts']),
  setting('datausage', '网络流量使用情况', 'datausage', ['data usage']),
  setting('dialup', '网络拨号设置', 'network-dialup', ['dial up']),
  setting('ethernet', '以太网设置', 'network-ethernet', ['ethernet', '有线网络']),
  setting('proxy', '网络代理设置', 'network-proxy', ['proxy']),
  setting('network', '网络设置', 'network-status', ['network settings', 'internet']),
  setting('wifi', 'Wi-Fi 设置', 'network-wifi', ['wifi', '无线网络']),
  setting('vpn', 'VPN 设置', 'network-vpn', ['vpn', '虚拟专用网络']),
  setting('wallpaper', '桌面背景设置', 'personalization-background', [
    'wallpaper background',
    '壁纸',
  ]),
  setting('colors', '系统颜色设置', 'personalization-colors', ['colors', '深色模式']),
  setting('lockscreen', '锁屏界面设置', 'lockscreen', ['lock screen settings']),
  setting('start', '开始菜单设置', 'personalization-start', ['start menu']),
  setting('themes', '主题设置', 'themes', ['themes', '外观']),
  setting('privacy', '权限和隐私设置', 'privacy', ['privacy settings', '摄像头权限', '麦克风权限']),
  setting('datetime', '日期和时间设置', 'dateandtime', ['date time settings', '时区']),
  setting('language', '区域和语言设置', 'regionlanguage', ['region language settings', '语言设置']),
  setting('speech', '语音设置', 'speech', ['speech']),
  setting('activation', '系统激活设置', 'activation', ['activation', '产品密钥']),
  setting('backup', '备份设置', 'backup', ['backup'], { maxBuild: 21999 }),
  setting('finddevice', '查找我的设备', 'findmydevice', ['find my device']),
  setting('developers', '开发者选项设置', 'developers', ['developers settings', '开发人员']),
  setting('recovery', '系统恢复设置', 'recovery', ['recovery', '重置电脑']),
  setting('troubleshoot', '疑难解答', 'troubleshoot', ['troubleshoot', '故障排查']),
  setting('security', 'Windows 安全设置', 'windowsdefender', [
    'security defender',
    '防火墙',
    '病毒防护',
  ]),
  // Opening Settings must not start an update scan as a side effect.
  setting('update', '系统更新设置', 'windowsupdate', [
    'windows update',
    '检测系统更新',
    '检查更新',
  ]),
];

// System Settings extension IDs require macOS 13+.
const macSettings: Setting[] = [
  setting('about', '关于本机', 'com.apple.SystemProfiler.AboutExtension', [
    'about',
    '电脑信息',
    '系统信息',
  ]),
  setting('display', '显示器设置', 'com.apple.Displays-Settings.extension', [
    'display settings',
    '屏幕',
    '分辨率',
    '亮度',
  ]),
  setting('sound', '声音设置', 'com.apple.Sound-Settings.extension', [
    'sound settings',
    '音量',
    '扬声器',
    '麦克风',
  ]),
  setting('network', '网络设置', 'com.apple.Network-Settings.extension', [
    'network settings',
    'internet',
    '代理',
    '以太网',
  ]),
  setting('wifi', 'Wi-Fi 设置', 'com.apple.wifi-settings-extension', ['wifi', '无线网络']),
  setting('bluetooth', '蓝牙设置', 'com.apple.BluetoothSettings', ['bluetooth settings']),
  setting('power', '电源和睡眠设置', 'com.apple.Battery-Settings.extension', [
    'power settings',
    'sleep settings',
    '电池',
    '节能',
  ]),
  setting('storage', '存储设置', 'com.apple.settings.Storage', ['storage settings', '磁盘空间']),
  setting('notifications', '通知设置', 'com.apple.Notifications-Settings.extension', [
    'notifications',
  ]),
  setting('appearance', '外观设置', 'com.apple.Appearance-Settings.extension', [
    'appearance',
    '深色模式',
    '主题',
  ]),
  setting('wallpaper', '壁纸设置', 'com.apple.Wallpaper-Settings.extension', [
    'wallpaper',
    '桌面背景',
  ]),
  setting('desktop', '桌面与程序坞设置', 'com.apple.Desktop-Settings.extension', [
    'desktop dock settings',
    '台前调度',
    '调度中心',
  ]),
  setting('keyboard', '键盘设置', 'com.apple.Keyboard-Settings.extension', [
    'keyboard settings',
    '打字',
    '输入法',
  ]),
  setting('mouse', '鼠标设置', 'com.apple.Mouse-Settings.extension', ['mouse settings']),
  setting('trackpad', '触控板设置', 'com.apple.Trackpad-Settings.extension', [
    'trackpad touchpad settings',
    '触摸板',
  ]),
  setting('printers', '打印机与扫描仪设置', 'com.apple.Print-Scan-Settings.extension', [
    'printers scanners settings',
  ]),
  setting('accessibility', '辅助功能设置', 'com.apple.Accessibility-Settings.extension', [
    'accessibility settings',
    '无障碍',
    '缩放',
    '旁白',
  ]),
  setting('privacy', '隐私与安全性设置', 'com.apple.settings.PrivacySecurity.extension', [
    'privacy security settings',
    '权限',
    '摄像头权限',
    '麦克风权限',
  ]),
  setting('users', '用户与群组设置', 'com.apple.Users-Groups-Settings.extension', [
    'users groups accounts',
    '账户',
  ]),
  setting('startup', '登录项设置', 'com.apple.LoginItems-Settings.extension', [
    'login items',
    'startup apps',
    '开机启动',
    '启动项',
    '自启动',
  ]),
  setting('update', '软件更新设置', 'com.apple.Software-Update-Settings.extension', [
    'software update',
    '系统更新',
    '检查更新',
  ]),
  setting('datetime', '日期与时间设置', 'com.apple.Date-Time-Settings.extension', [
    'date time settings',
    '时区',
  ]),
  setting('language', '语言与地区设置', 'com.apple.Localization-Settings.extension', [
    'language region settings',
    '语言设置',
  ]),
  setting('sharing', '共享设置', 'com.apple.Sharing-Settings.extension', [
    'sharing',
    '文件共享',
    '远程登录',
    '屏幕共享',
  ]),
  setting('timemachine', '时间机器设置', 'com.apple.Time-Machine-Settings.extension', [
    'time machine',
    '备份',
  ]),
  setting('focus', '专注模式设置', 'com.apple.Focus-Settings.extension', ['focus', '勿扰']),
  setting('screentime', '屏幕使用时间设置', 'com.apple.Screen-Time-Settings.extension', [
    'screen time',
  ]),
  setting('spotlight', '聚焦搜索设置', 'com.apple.Spotlight-Settings.extension', [
    'spotlight',
    '聚焦',
  ]),
  setting('lockscreen', '锁定屏幕设置', 'com.apple.Lock-Screen-Settings.extension', [
    'lock screen settings',
    '锁屏设置',
  ]),
  setting('internetaccounts', '互联网账户设置', 'com.apple.Internet-Accounts-Settings.extension', [
    'internet accounts',
    '邮件账户',
  ]),
  setting('airdrop', '隔空投送与接力设置', 'com.apple.AirDrop-Handoff-Settings.extension', [
    'airdrop handoff',
    '接力',
  ]),
];

const actions: { action: SystemAction; name: string; keywords: string[]; confirm?: boolean }[] = [
  { action: 'lock', name: '锁屏', keywords: ['lock', 'lock screen', '锁定电脑'] },
  { action: 'sleep', name: '睡眠', keywords: ['sleep', '挂起'], confirm: true },
  { action: 'restart', name: '重启', keywords: ['restart', 'reboot', '重新启动'], confirm: true },
  {
    action: 'shutdown',
    name: '关机',
    keywords: ['shutdown', 'shut down', '关闭电脑'],
    confirm: true,
  },
  {
    action: 'logout',
    name: '注销',
    keywords: ['logout', 'log out', 'sign out', '退出登录'],
    confirm: true,
  },
  { action: 'desktop', name: '显示桌面', keywords: ['show desktop', '桌面显示切换'] },
];

export function systemCommands(platform: string, release: string): SystemCommand[] {
  if (platform !== 'darwin' && platform !== 'win32') return [];
  const [major, , build = 0] = release.split('.').map(Number);
  const settings =
    platform === 'win32'
      ? major >= 10
        ? windowsSettings.filter(
            (s) => build >= (s.minBuild ?? 0) && build <= (s.maxBuild ?? Infinity),
          )
        : []
      : major >= 22
        ? macSettings
        : [];
  return [
    ...settings.map(({ id, name, target, keywords }) => ({
      id: 'system:settings:' + id,
      name: t(name),
      subtitle: t('{{v0}} 系统设置', { v0: platform === 'darwin' ? 'macOS' : 'Windows' }),
      kind: 'system' as const,
      keywords: [...keywords, ...commandNames(name)],
      color: '#778596',
      url: (platform === 'darwin' ? 'x-apple.systempreferences:' : 'ms-settings:') + target,
    })),
    ...actions.map(({ action, name, keywords, confirm }) => ({
      id: 'system:action:' + action,
      name: t(name),
      subtitle: `${t(name)} · ${t(confirm ? '确认后执行' : '系统操作')}`,
      kind: 'system' as const,
      keywords: [...keywords, ...commandNames(name)],
      color: '#687b94',
      action,
      confirm,
    })),
  ];
}
