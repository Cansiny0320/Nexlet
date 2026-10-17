import { t } from '../shared/i18n';
import childProcess from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

function spawnInstaller(command: string, args: string[], waitForHandoff: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    // Do not inherit a virtualized or removed working directory. Resolve both
    // paths before crossing into the installer/elevation process.
    const child = childProcess.spawn(realpathSync.native(command), args, {
      cwd: realpathSync.native(tmpdir()),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    if (waitForHandoff) {
      // elevate.exe (without -wait) exits after ShellExecuteEx hands the
      // installer off. Its spawn event alone does not mean UAC succeeded.
      child.once('exit', (code, signal) => {
        child.unref();
        if (code === 0) resolve();
        else reject(Error(t('更新安装器提权失败或已取消（{{v0}}）', { v0: signal || code })));
      });
    } else {
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    }
  });
}

export async function launchWindowsUpdate(
  command: string,
  args: string[],
  elevate: string,
): Promise<void> {
  try {
    await spawnInstaller(command, args, command === elevate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (command !== elevate && (code === 'EACCES' || code === 'UNKNOWN')) {
      await spawnInstaller(elevate, [realpathSync.native(command), ...args], true);
    } else {
      // Never fall back to shell.openPath(): it drops installer arguments and
      // may display an Explorer error after the application has already quit.
      throw error;
    }
  }
}
