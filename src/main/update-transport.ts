import { MacUpdater, NsisUpdater, AppImageUpdater } from 'electron-updater';
import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater';
import { withDownloadProgress } from './update-progress';

class MacUpdates extends MacUpdater {
  protected override executeDownload(options: DownloadExecutorTask) {
    return super.executeDownload(withDownloadProgress(options));
  }
}
class WindowsUpdates extends NsisUpdater {
  protected override executeDownload(options: DownloadExecutorTask) {
    return super.executeDownload(withDownloadProgress(options));
  }
}
class LinuxUpdates extends AppImageUpdater {
  protected override executeDownload(options: DownloadExecutorTask) { return super.executeDownload(withDownloadProgress(options)); }
}
export function createUpdateTransport() {
  if(process.platform==='linux')return new LinuxUpdates();
  return process.platform === 'darwin' ? new MacUpdates() : new WindowsUpdates();
}
