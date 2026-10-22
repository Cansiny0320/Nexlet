import { BrowserWindow, session } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { configurePluginSession } from './plugin-session';
import type { ClipItem, PluginRecord } from '../shared/types';
import { t } from '../shared/i18n';
export class OcrIndexRunner {
  constructor(private plugins: () => PluginRecord[]) {}
  async available() {
    const record = this.plugins().find(
      (record) => record.manifest.id === 'org.nexlet.ocr' && record.enabled,
    );
    if (!record) throw Error(t('请先安装并启用离线 OCR 插件'));
    try {
      if (!(await stat(path.join(record.directory, 'ocr-index.html'))).isFile()) throw Error();
    } catch {
      throw Error(t('请更新离线 OCR 插件以使用图片文字索引'));
    }
    return record;
  }
  async recognize(
    item: ClipItem,
    signal: AbortSignal,
    progress: (value: number) => void,
  ): Promise<string> {
    signal.throwIfAborted();
    const record = await this.available();
    const info = await stat(item.imagePath!);
    if (!info.isFile() || info.size > 20 * 1024 * 1024)
      throw Error(t('图片附件不存在或超过 20 MB'));
    const bytes = await readFile(item.imagePath!);
    signal.throwIfAborted();
    const isolated = session.fromPartition('nexlet-ocr-index');
    if (await isolated.protocol.isProtocolHandled('nexlet-plugin'))
      isolated.protocol.unhandle('nexlet-plugin');
    configurePluginSession(isolated, record);
    const window = new BrowserWindow({
      show: false,
      focusable: false,
      skipTaskbar: true,
      width: 1,
      height: 1,
      webPreferences: {
        partition: 'nexlet-ocr-index',
        preload: path.join(__dirname, '../preload/ocr-index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        backgroundThrottling: false,
        devTools: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error?: Error, text?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        if (!window.isDestroyed()) window.destroy();
        isolated.protocol.unhandle('nexlet-plugin');
        error ? reject(error) : resolve(text || '');
      };
      const cancel = () => finish(Error(t('识别已取消')));
      const timer = setTimeout(() => finish(Error(t('图片识别超时'))), 90_000);
      signal.addEventListener('abort', cancel, { once: true });
      window.once('closed', () => finish(Error(t('OCR 任务已关闭'))));
      window.webContents.once('render-process-gone', () => finish(Error(t('OCR 进程意外退出'))));
      window.webContents.on('ipc-message', (event, channel, value) => {
        if (done || event.senderFrame !== window.webContents.mainFrame) return;
        if (channel === 'ocr-index:ready')
          window.webContents.send('ocr-index:run', new Uint8Array(bytes));
        else if (
          channel === 'ocr-index:progress' &&
          typeof value === 'number' &&
          Number.isFinite(value)
        )
          progress(value);
        else if (channel === 'ocr-index:result') {
          if (value && typeof value.text === 'string' && value.text.length <= 500000)
            finish(undefined, value.text);
          else
            finish(
              Error(
                value && typeof value.error === 'string'
                  ? value.error.slice(0, 1000)
                  : t('OCR 结果无效'),
              ),
            );
        }
      });
      void window.loadURL(`nexlet-plugin://${record.manifest.id}/ocr-index.html`).catch(finish);
      if (signal.aborted) cancel();
    });
  }
}
