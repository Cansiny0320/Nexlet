import { BrowserWindow } from 'electron';
import path from 'node:path';
import { t } from '../shared/i18n';

export interface CapturedImage {
  hash: string;
  imagePath: string;
  thumbnail: string;
  width: number;
  height: number;
}
export type ImageWork =
  | { kind: 'capture'; bytes: Uint8Array; directory: string }
  | { kind: 'copy'; file: string };
export interface ImageRequest {
  id: number;
  work: ImageWork;
}
export interface ImageResponse {
  id: number;
  value?: CapturedImage | Uint8Array | null;
  error?: string;
}

/** nativeImage is available in a trusted preload, but not in a Node Worker. */
export class ClipboardImages {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private sequence = 0;
  private closed = false;
  private idle: NodeJS.Timeout | null = null;
  private requests = new Map<
    number,
    {
      resolve(value: ImageResponse['value']): void;
      reject(error: Error): void;
      timer: NodeJS.Timeout;
    }
  >();
  private connect(): Promise<void> {
    if (this.closed) return Promise.reject(Error('Image processor closed'));
    if (this.ready) return this.ready;
    const window = new BrowserWindow({
      show: false,
      focusable: false,
      skipTaskbar: true,
      width: 1,
      height: 1,
      webPreferences: {
        preload: path.join(__dirname, '../preload/clipboard-image.cjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        devTools: false,
      },
    });
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.webContents.on('ipc-message', (_event, channel, response: ImageResponse) => {
      if (channel !== 'clipboard-image:result' || this.window !== window) return;
      const request = this.requests.get(response.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.requests.delete(response.id);
      if (response.error) request.reject(Error(t(response.error)));
      else request.resolve(response.value);
      this.recycle();
    });
    window.webContents.once('render-process-gone', () => {
      if (this.window === window) this.destroy(Error('Image processor exited'));
    });
    window.once('closed', () => {
      if (this.window === window) this.destroy(Error('Image processor closed'));
    });
    this.ready = window
      .loadURL(
        'data:text/html;charset=utf-8,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27">',
      )
      .catch((error) => {
        if (this.window === window) this.destroy(error);
        throw error;
      });
    return this.ready;
  }
  private recycle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (!this.requests.size) {
      this.idle = setTimeout(() => this.destroy(), 30_000);
      this.idle.unref();
    }
  }
  private destroy(error = Error('Image processor closed')) {
    const window = this.window;
    this.window = null;
    this.ready = null;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    for (const request of this.requests.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.requests.clear();
    if (window && !window.isDestroyed()) window.destroy();
  }
  private async run(work: ImageWork) {
    if (this.idle) clearTimeout(this.idle);
    await this.connect();
    if (this.closed || !this.window) throw Error('Image processor closed');
    if (this.requests.size >= 8) throw Error('Image processing queue is full');
    const id = ++this.sequence;
    return new Promise<ImageResponse['value']>((resolve, reject) => {
      const timer = setTimeout(() => this.destroy(Error('Image processing timed out')), 30_000);
      this.requests.set(id, { resolve, reject, timer });
      this.window!.webContents.send('clipboard-image:run', { id, work } satisfies ImageRequest);
    });
  }
  async capture(bytes: Uint8Array, directory: string): Promise<CapturedImage | null> {
    return (await this.run({ kind: 'capture', bytes, directory })) as CapturedImage | null;
  }
  async copy(file: string): Promise<Uint8Array> {
    return (await this.run({ kind: 'copy', file })) as Uint8Array;
  }
  close() {
    this.closed = true;
    this.destroy();
  }
}
