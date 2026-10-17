import { t } from '../shared/i18n';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { StartupStatus } from '../shared/types';
export const LINUX_DESKTOP_NAME = 'app.nexlet.desktop.desktop';
/** Desktop Exec has both argument quoting and desktop-string escaping. */
export function desktopExec(file: string): string {
  if (!path.posix.isAbsolute(file) || /[\0\r\n]/.test(file))
    throw Error(t('自启动需要有效的应用绝对路径'));
  return (
    '"' +
    file
      .replace(/%/g, '%%')
      .replace(/[\\"`$]/g, '\\$&')
      .replace(/\\/g, '\\\\') +
    '"'
  );
}
export class LinuxStartup {
  private file: string;
  constructor(
    private executable: string,
    config = process.env.XDG_CONFIG_HOME && path.isAbsolute(process.env.XDG_CONFIG_HOME)
      ? process.env.XDG_CONFIG_HOME
      : path.join(homedir(), '.config'),
  ) {
    this.file = path.join(config, 'autostart', LINUX_DESKTOP_NAME);
  }
  private exec() {
    return `Exec=${desktopExec(this.executable)} --autostart`;
  }
  read(): StartupStatus {
    try {
      const exec = this.exec();
      if (!existsSync(this.file)) return { supported: true, enabled: false, reason: null };
      const lines = readFileSync(this.file, 'utf8').split(/\r?\n/);
      const enabled =
        lines.includes(exec) &&
        !lines.includes('Hidden=true') &&
        !lines.includes('X-GNOME-Autostart-enabled=false');
      return {
        supported: true,
        enabled,
        reason: !lines.includes(exec) ? t('应用位置已变化，请重新开启自启动') : null,
      };
    } catch (error) {
      return {
        supported: false,
        enabled: false,
        reason: t('无法读取自启动项：{{v0}}', { v0: (error as Error).message }),
      };
    }
  }
  set(enabled: boolean): StartupStatus {
    if (enabled) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      writeFileSync(
        temporary,
        `[Desktop Entry]\nType=Application\nName=Nexlet\n${this.exec()}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`,
        { mode: 0o600 },
      );
      renameSync(temporary, this.file);
    } else rmSync(this.file, { force: true });
    const result = this.read();
    if (result.enabled !== enabled) throw Error(result.reason || t('系统未保存自启动设置'));
    return result;
  }
}
