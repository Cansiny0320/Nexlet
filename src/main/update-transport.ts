import { MacUpdater, NsisUpdater, AppImageUpdater } from 'electron-updater';
import { realpathSync } from 'node:fs';
import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater';
import { withDownloadProgress } from './update-progress';

class MacUpdates extends MacUpdater {
  private sampleDownload = true;
  protected override executeDownload(options: DownloadExecutorTask) {
    this.sampleDownload = true;
    return super.executeDownload(withDownloadProgress(options, () => this.sampleDownload));
  }
  protected override async differentialDownloadInstaller(...args: Parameters<MacUpdater['differentialDownloadInstaller']>) {
    // Differential progress is emitted directly by the updater; file growth also
    // includes copied blocks and must never be reported as downloaded bytes.
    this.sampleDownload = false;
    const needsFullDownload = await super.differentialDownloadInstaller(...args);
    this.sampleDownload = needsFullDownload;
    return needsFullDownload;
  }
}
class WindowsUpdates extends NsisUpdater {
  private sampleDownload = true;
  protected override get installerPath(): string | null {
    const installer = super.installerPath;
    // MSIX can redirect AppData into a package's private cache. Processes
    // outside that package (including elevation) need the physical path.
    return installer === null ? null : realpathSync.native(installer);
  }
  protected override executeDownload(options: DownloadExecutorTask) {
    this.sampleDownload = true;
    return super.executeDownload(withDownloadProgress(options, () => this.sampleDownload));
  }
  protected override async differentialDownloadInstaller(...args: Parameters<NsisUpdater['differentialDownloadInstaller']>) {
    this.sampleDownload = false;
    const needsFullDownload = await super.differentialDownloadInstaller(...args);
    this.sampleDownload = needsFullDownload;
    return needsFullDownload;
  }
}
class LinuxUpdates extends AppImageUpdater {
  protected override executeDownload(options: DownloadExecutorTask) { return super.executeDownload(withDownloadProgress(options)); }
}
export function createUpdateTransport() {
  if(process.platform==='linux')return new LinuxUpdates();
  return process.platform === 'darwin' ? new MacUpdates() : new WindowsUpdates();
}
