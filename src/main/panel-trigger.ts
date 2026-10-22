import { t, currentLocale } from '../shared/i18n';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { screen, type Rectangle } from 'electron';
import type { PanelConfig, PanelStatus } from '../shared/super-panel';
export class PanelTrigger {
  private worker: Worker | null = null;
  private key = '';
  private busy = false;
  private status: PanelStatus = {
    supported: ['darwin', 'win32'].includes(process.platform),
    mouseActive: false,
    accessibility: false,
    error: null,
  };
  constructor(
    private receive: (message: any) => void,
    private changed: () => void,
    private trusted: () => boolean,
    private testMode = false,
  ) {}
  read() {
    return { ...this.status, accessibility: this.trusted() };
  }
  configure(config: PanelConfig) {
    const key = JSON.stringify([config.enabled, config.mouse, config.holdMs, config.excludedApps]);
    if (key === this.key) return;
    this.key = key;
    this.stop();
    this.status = { ...this.status, mouseActive: false, error: null };
    if (!config.enabled || config.mouse === 'off' || this.testMode) {
      this.changed();
      return;
    }
    if (!this.status.supported) {
      this.status.error = t('当前平台可使用面板快捷键，鼠标触发暂不支持');
      this.changed();
      return;
    }
    if (process.platform === 'darwin' && !this.trusted()) {
      this.status.error = t('开启鼠标触发和选区获取需要辅助功能权限');
      this.changed();
      return;
    }
    const worker = new Worker(path.join(__dirname, 'panel-native-worker.cjs'), {
      workerData: {
        locale: currentLocale(),
        mouse: config.mouse,
        holdMs: config.holdMs,
        excludedApps: config.excludedApps,
        busy: this.busy,
      },
    });
    this.worker = worker;
    worker.on('message', (message) => {
      if (this.worker !== worker) return;
      if (message.type === 'ready') {
        this.status.mouseActive = true;
        this.changed();
      } else if (message.type === 'error') {
        this.status.mouseActive = false;
        this.status.error = message.error;
        this.changed();
      } else this.receive(message);
    });
    worker.on('error', (error) => {
      if (this.worker === worker) {
        this.status.mouseActive = false;
        this.status.error = error.message;
        this.changed();
      }
    });
    worker.on('exit', () => {
      if (this.worker === worker) {
        this.worker = null;
        this.status.mouseActive = false;
        this.changed();
      }
    });
  }
  setBusy(busy: boolean, readConfig: PanelConfig | (() => PanelConfig)) {
    if (this.busy === busy) return;
    this.busy = busy;
    if (!this.worker) return;
    const config = typeof readConfig === 'function' ? readConfig() : readConfig;
    this.worker?.postMessage({
      type: 'config',
      config: {
        mouse: config.mouse,
        holdMs: config.holdMs,
        excludedApps: config.excludedApps,
        busy,
      },
    });
  }
  refreshLocale() {
    this.worker?.postMessage({ type: 'locale', locale: currentLocale() });
  }
  setPanel(bounds: Rectangle | null) {
    this.worker?.postMessage({
      type: 'panel',
      bounds:
        bounds && process.platform === 'win32' ? screen.dipToScreenRect(null, bounds) : bounds,
    });
  }
  retry(config: PanelConfig) {
    this.key = '';
    this.configure(config);
  }
  stop() {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.postMessage({ type: 'stop' });
      const timer = setTimeout(() => void worker.terminate(), 1000);
      timer.unref();
      worker.once('exit', () => clearTimeout(timer));
    }
    this.status.mouseActive = false;
  }
  close() {
    this.stop();
  }
}
