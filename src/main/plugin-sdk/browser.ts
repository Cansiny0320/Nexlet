import { t } from '../../shared/i18n';
import { BrowserWindow, session, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { object, string, type SdkContext } from './context';
import type { PluginTasks } from './tasks';

interface BrowserHandle { window: BrowserWindow; owner: number; plugin: string; download?: { url: string; path: string; resolve(value: unknown): void; reject(error: Error): void }; }
const url = (value: unknown) => { const parsed = new URL(string(value, 16384)); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(t("浏览器只允许 HTTP / HTTPS URL")); return parsed.href; };
export class PluginBrowsers {
  private handles = new Map<string, BrowserHandle>();
  private sessions = new Map<string, Session>();
  constructor(private tasks: PluginTasks) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('browser'); const args = object(value ?? {});
    if (method === 'browser.create') {
      if ([...this.handles.values()].filter(handle => handle.owner === context.contents.id).length >= 8) throw new Error(t("浏览器窗口超过 8 个"));
      const isolated = this.isolated(context.plugin), width = Number(args.width ?? 1000), height = Number(args.height ?? 700);
      if (![width, height].every(n => Number.isInteger(n) && n >= 100 && n <= 4096)) throw new Error(t("浏览器尺寸无效"));
      const window = new BrowserWindow({ width, height, show: args.visible === true, title: context.record.manifest.name, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
      window.setMenu(null); window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, location) => { try { url(location); } catch { event.preventDefault(); } });
      window.webContents.on('will-redirect', (event, location) => { try { url(location); } catch { event.preventDefault(); } });
      const id = randomUUID(), handle: BrowserHandle = { window, owner: context.contents.id, plugin: context.plugin };
      const download = (event: Electron.Event, item: Electron.DownloadItem, contents: Electron.WebContents) => {
        if (contents !== window.webContents) return;
        const pending = handle.download;
        if (!pending || !item.getURLChain().includes(pending.url)) { event.preventDefault(); return; }
        handle.download = undefined; item.setSavePath(pending.path);
        const closed = () => item.cancel(); window.once('closed', closed);
        item.on('updated', () => context.emit('browser.download', { browser: id, received: item.getReceivedBytes(), total: item.getTotalBytes() }));
        item.once('done', (_, state) => { window.removeListener('closed', closed); if (state === 'completed') pending.resolve({ path: item.getSavePath(), bytes: item.getReceivedBytes() }); else pending.reject(new Error(t("下载{{v0}}", { v0: state }))); });
      };
      isolated.on('will-download', download);
      window.once('closed', () => { isolated.removeListener('will-download', download); this.handles.delete(id); handle.download?.reject(new Error(t("浏览器已关闭"))); context.emit('browser.closed', { browser: id }); });
      this.handles.set(id, handle);
      return id;
    }
    const handle = this.handles.get(string(args.browser, 100));
    if (!handle || handle.owner !== context.contents.id || handle.plugin !== context.plugin || handle.window.isDestroyed()) throw new Error(t("浏览器句柄无效"));
    if (method === 'browser.close') { handle.window.destroy(); return true; }
    if (method !== 'browser.perform') throw new Error(t("不支持的浏览器 API"));
    const id = string(args.id, 100), action = object(args.action), window = handle.window, contents = window.webContents;
    return this.tasks.run(context.contents.id, id, Number(args.timeoutMs ?? 30000), async signal => {
      const abort = () => { if (!window.isDestroyed()) window.destroy(); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        switch (action.type) {
          case 'navigate': await contents.loadURL(url(action.url)); return { url: contents.getURL(), title: contents.getTitle() };
          case 'show': window.show(); return true;
          case 'hide': window.hide(); return true;
          case 'info': return { url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading() };
          case 'evaluate': return await contents.executeJavaScript(string(action.script, 256 * 1024), true);
          case 'wait': {
            const selector = string(action.selector, 4096);
            while (true) {
              signal.throwIfAborted();
              if (await contents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)) return true;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          case 'click': return await contents.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(string(action.selector))});if(!e)throw Error('Element not found');e.click();return true})()`, true);
          case 'type': {
            if (typeof action.text !== 'string' || action.text.length > 1024 * 1024) throw new Error(t("文本参数无效"));
            const selector = JSON.stringify(string(action.selector));
            await contents.executeJavaScript(`(()=>{const e=document.querySelector(${selector});if(!e)throw Error('Element not found');e.focus();${action.clear === true ? "if('value' in e)e.select();else{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r)}" : ''}return true})()`, true);
            await contents.insertText(action.text); return true;
          }
          case 'input': {
            const event = object(action.event);
            if (!['keyDown', 'keyUp', 'char', 'mouseDown', 'mouseUp', 'mouseMove', 'mouseWheel'].includes(String(event.type))) throw new Error(t("浏览器输入事件无效"));
            contents.sendInputEvent(event as unknown as Electron.MouseInputEvent); return true;
          }
          case 'screenshot': return new Uint8Array((await contents.capturePage()).toPNG());
          case 'pdf': return new Uint8Array(await contents.printToPDF({ printBackground: true, landscape: action.landscape === true }));
          case 'cookies': return contents.session.cookies.get(action.url === undefined ? {} : { url: url(action.url) });
          case 'setCookie': { const cookie = object(action.cookie); await contents.session.cookies.set({ ...cookie, url: url(cookie.url), name: string(cookie.name, 1000), value: typeof cookie.value === 'string' ? cookie.value : '' }); return true; }
          case 'removeCookie': await contents.session.cookies.remove(url(action.url), string(action.name, 1000)); return true;
          case 'proxy': await contents.session.setProxy({ mode: action.rules ? 'fixed_servers' : 'direct', proxyRules: action.rules === undefined ? undefined : string(action.rules), proxyBypassRules: typeof action.bypass === 'string' ? action.bypass : undefined }); await contents.session.closeAllConnections(); return true;
          case 'clear': await contents.session.clearCache(); if (action.cookies === true) await contents.session.clearStorageData(); return true;
          case 'userAgent': contents.setUserAgent(string(action.value, 4096)); return true;
          case 'files': {
            context.require('files');
            if (!Array.isArray(action.paths) || action.paths.length > 100) throw new Error(t("文件列表无效"));
            const files = action.paths.map(p => string(p)); for (const file of files) { if (!path.isAbsolute(file)) throw new Error(t("文件路径必须为绝对路径")); await access(file); }
            if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
            try { const { root } = await contents.debugger.sendCommand('DOM.getDocument'); const { nodeId } = await contents.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: string(action.selector) }); if (!nodeId) throw new Error(t("文件输入框不存在")); await contents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files }); return true; }
            finally { contents.debugger.detach(); }
          }
          case 'download': {
            context.require('files');
            const target = string(action.path); if (!path.isAbsolute(target)) throw new Error(t("下载路径必须为绝对路径"));
            try { await access(target); throw new Error(t("下载目标已存在")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
            if (handle.download) throw new Error(t("当前浏览器已有下载任务"));
            return await new Promise((resolve, reject) => { handle.download = { url: url(action.url), path: target, resolve, reject }; contents.downloadURL(handle.download.url); });
          }
          default: throw new Error(t("浏览器操作无效"));
        }
      } finally { signal.removeEventListener('abort', abort); }
    });
  }
  private isolated(plugin: string): Session {
    let isolated = this.sessions.get(plugin);
    if (!isolated) {
      isolated = session.fromPartition(`persist:nexlet-browser-${plugin}`);
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)); isolated.setPermissionCheckHandler(() => false);
      this.sessions.set(plugin, isolated);
    }
    return isolated;
  }
  closeSession(owner: number): void { for (const handle of this.handles.values()) if (handle.owner === owner) handle.window.destroy(); }
  stop(plugin: string): void { for (const handle of this.handles.values()) if (handle.plugin === plugin) handle.window.destroy(); }
  async clear(plugin: string): Promise<void> { this.stop(plugin); const isolated = this.isolated(plugin); await isolated.clearStorageData(); await isolated.clearCache(); }
  close(): void { for (const handle of this.handles.values()) handle.window.destroy(); }
}
