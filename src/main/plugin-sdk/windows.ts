import { t } from '../../shared/i18n';
import { BrowserWindow, type WebContents } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeEntryPath } from '../../shared/plugin-validation';
import { object, string, type SdkContext } from './context';
export interface WindowHooks { register(parent: number, window: BrowserWindow): () => void; detach(owner: BrowserWindow): Promise<void>; exit(plugin: string): Promise<void>; }
interface Child { id: string; root: number; plugin: string; window: BrowserWindow; parent: WebContents; }
export class PluginWindows {
  private children = new Map<string, Child>();
  constructor(private hooks: WindowHooks) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('windows'); const args = object(value ?? {});
    const root = [...this.children.values()].find(child => child.window.webContents === context.contents)?.root ?? context.contents.id;
    let window = context.owner;
    if (args.window !== undefined && args.window !== null) {
      const child = this.children.get(string(args.window, 100)); if (!child || child.root !== root || child.plugin !== context.plugin) throw new Error(t("窗口句柄无效")); window = child.window;
    }
    switch (method) {
      case 'window.info': return { bounds: window.getBounds(), visible: window.isVisible(), focused: window.isFocused(), alwaysOnTop: window.isAlwaysOnTop(), fullScreen: window.isFullScreen() };
      case 'window.show': window.show(); (args.window ? window.webContents : context.contents).focus(); return true;
      case 'window.hide': window.hide(); return true;
      case 'window.focus': window.focus(); return true;
      case 'window.close': if ([...this.children.values()].some(child => child.window === window)) window.destroy(); else setImmediate(() => { void this.hooks.exit(context.plugin); }); return true;
      case 'window.detach': await this.hooks.detach(context.hostOwner ?? context.owner); return true;
      case 'window.set': {
        const options = object(args.options);
        if (options.bounds) { const b = object(options.bounds), bounds: Partial<Electron.Rectangle> = {}; for (const key of ['x', 'y', 'width', 'height'] as const) if (b[key] !== undefined) { if (!Number.isInteger(b[key]) || Math.abs(Number(b[key])) > 32768 || ((key === 'width' || key === 'height') && Number(b[key]) < 100)) throw new Error(t("窗口尺寸无效")); bounds[key] = Number(b[key]); } window.setBounds(bounds); }
        if (options.alwaysOnTop !== undefined) window.setAlwaysOnTop(options.alwaysOnTop === true);
        if (options.fullScreen !== undefined) window.setFullScreen(options.fullScreen === true);
        if (options.resizable !== undefined) window.setResizable(options.resizable === true);
        if (options.opacity !== undefined) { const opacity = Number(options.opacity); if (!Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) throw new Error(t("窗口透明度无效")); window.setOpacity(opacity); }
        if (options.title !== undefined) window.setTitle(string(options.title, 200)); return true;
      }
      case 'window.create': {
        if ([...this.children.values()].filter(child => child.root === root).length >= 8) throw new Error(t("子窗口超过 8 个"));
        const entry = safeEntryPath(string(args.entry, 240)); if (!/\.html$/i.test(entry)) throw new Error(t("子窗口入口必须是插件内 HTML"));
        const width = Number(args.width ?? 640), height = Number(args.height ?? 480);
        if (![width, height].every(n => Number.isInteger(n) && n >= 100 && n <= 4096)) throw new Error(t("子窗口尺寸无效"));
        const child = new BrowserWindow({ width, height, show: false, title: typeof args.title === 'string' ? args.title : context.record.manifest.name, webPreferences: { session: context.isolated, preload: path.join(__dirname, '../preload/plugin.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
        child.setMenu(null); child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        const target = `nexlet-plugin://${context.plugin}/${entry}`;
        child.webContents.on('will-navigate', (event, url) => { if (url !== target) event.preventDefault(); }); child.webContents.on('will-attach-webview', event => event.preventDefault());
        const release = this.hooks.register(context.contents.id, child), id = randomUUID();
        this.children.set(id, { id, root, plugin: context.plugin, window: child, parent: context.contents });
        child.once('closed', () => { this.children.delete(id); release(); context.emit('window.closed', { window: id }); });
        try { await child.loadURL(target); if (child.isDestroyed()) throw new Error(t("子窗口已关闭")); if (args.visible !== false) child.show(); return id; }
        catch (error) { if (!child.isDestroyed()) child.destroy(); throw error; }
      }
      case 'window.send': {
        let recipient: WebContents, from: string | null = null;
        const self = [...this.children.values()].find(child => child.window.webContents === context.contents);
        if (args.window === undefined || args.window === null) { if (!self) throw new Error(t("主插件窗口没有父窗口")); recipient = self.parent; from = self.id; }
        else recipient = window.webContents;
        if (JSON.stringify(args.message).length > 1024 * 1024) throw new Error(t("窗口消息超过 1 MB"));
        if (recipient.isDestroyed()) throw new Error(t("接收窗口已关闭")); recipient.send('plugin-sdk-event', { event: 'window.message', value: { from, message: args.message } }); return true;
      }
      default: throw new Error(t("不支持的窗口 API"));
    }
  }
  closeSession(id: number): void { for (const child of this.children.values()) if (child.root === id || child.window.webContents.id === id) child.window.destroy(); }
  stop(plugin: string): void { for (const child of this.children.values()) if (child.plugin === plugin) child.window.destroy(); }
  close(): void { for (const child of this.children.values()) child.window.destroy(); }
}
