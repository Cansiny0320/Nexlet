import { LinuxStartup } from './linux-startup';
import type { App } from 'electron';
import type { StartupStatus } from '../shared/types';

type LoginHost = Pick<App, 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>;

/** Read system state instead of storing a second, potentially stale enabled flag. */
export class StartupManager {
  constructor(private host: LoginHost, private platform: string, private executable: string, private portable?: string) {}

  private linux() { return new LinuxStartup(process.env.APPIMAGE || this.executable); }

  private options() {
    return this.platform === 'win32' ? { path: this.portable || this.executable, args: ['--autostart'] } : {};
  }

  read(): StartupStatus {
    if (this.platform === 'linux' && this.host.isPackaged) return this.linux().read();
    if (!['win32', 'darwin'].includes(this.platform)) return { supported: false, enabled: false, reason: '此平台暂不支持开机自启动' };
    if (!this.host.isPackaged) return { supported: false, enabled: false, reason: '请在打包后的 Nexlet 中设置开机自启动' };
    try {
      const item = this.host.getLoginItemSettings(this.options());
      const blocked = this.platform === 'win32' && item.executableWillLaunchAtLogin === false;
      const pending = this.platform === 'darwin' && item.status === 'requires-approval';
      return {
        supported: true,
        enabled: item.openAtLogin && !blocked && !pending,
        reason: pending ? '请在系统设置 → 通用 → 登录项中允许 Nexlet' : item.openAtLogin && blocked ? '系统已禁用 Nexlet 自启动，可重新开启' : null
      };
    } catch (error) {
      return { supported: false, enabled: false, reason: `无法读取系统自启动设置：${(error as Error).message}` };
    }
  }

  set(enabled: boolean): StartupStatus {
    const before = this.read();
    if (!before.supported) throw new Error(before.reason || '不支持开机自启动');
    if (this.platform === 'linux') return this.linux().set(enabled);
    this.host.setLoginItemSettings(this.platform === 'win32'
      ? { ...this.options(), openAtLogin: enabled, enabled, name: 'app.nexlet.desktop' }
      : { openAtLogin: enabled });
    const after = this.read();
    if (after.enabled !== enabled && !after.reason?.includes('系统设置')) throw new Error(after.reason || '系统未保存自启动设置，请检查应用位置与系统权限');
    return after;
  }

  wasOpenedAtLogin(argv: string[]): boolean {
    if (argv.includes('--autostart')) return true;
    if (this.platform !== 'darwin') return false;
    try { return this.host.getLoginItemSettings().wasOpenedAtLogin; } catch { return false; }
  }
}
