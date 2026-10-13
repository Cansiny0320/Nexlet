import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { shell, systemPreferences } from 'electron';
import { windowsPowerAction } from './system-native-windows';
import type { SystemExecutor } from './system-actions';
import type { SystemAction } from './system-commands';

const exec = promisify(execFile);
const macScripts = {
  lock: 'tell application "System Events" to keystroke "q" using {control down, command down}',
  restart: 'tell application "System Events" to restart',
  shutdown: 'tell application "System Events" to shut down',
  logout: 'tell application "System Events" to log out'
};

export function createSystemExecutor(platform = process.platform): SystemExecutor {
  return {
    open: url => shell.openExternal(url),
    async execute(action: SystemAction) {
      if (platform === 'win32') {
        if (action === 'lock' || action === 'sleep') return windowsPowerAction(action);
        const system = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
        if (action === 'desktop') {
          await exec(path.win32.join(system, 'WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; (New-Object -ComObject Shell.Application).ToggleDesktop()"], { windowsHide: true, timeout: 10000 });
        } else {
          const args = { restart: ['/r', '/t', '0'], shutdown: ['/s', '/t', '0'], logout: ['/l'] }[action];
          if (!args) throw Error('系统操作无效');
          // No /f: let applications protect unsaved work.
          await exec(path.win32.join(system, 'shutdown.exe'), args, { windowsHide: true, timeout: 10000 });
        }
        return;
      }
      if (platform === 'darwin') {
        if (action === 'sleep') { await exec('/usr/bin/pmset', ['sleepnow'], { timeout: 10000 }); return; }
        if (action === 'desktop') {
          // The shipped Mission Control executable dispatches argument 1 to
          // com.apple.showdesktop.awake, independent of customized hotkeys.
          await exec('/System/Applications/Mission Control.app/Contents/MacOS/Mission Control', ['1'], { timeout: 10000 }); return;
        }
        if (action === 'lock' && !systemPreferences.isTrustedAccessibilityClient(false)) {
          throw Error('锁屏需要辅助功能权限，请在系统设置 → 隐私与安全性 → 辅助功能中允许 Nexlet');
        }
        const script = macScripts[action];
        if (!script) throw Error('系统操作无效');
        await exec('/usr/bin/osascript', ['-e', script], { timeout: 30000 });
        return;
      }
      throw Error('当前平台不支持此系统操作');
    }
  };
}
