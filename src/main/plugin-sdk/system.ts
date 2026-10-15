import { t } from '../../shared/i18n';
import { app, nativeTheme, shell, dialog, Notification, clipboard, ClipboardItem, nativeImage } from 'electron';
import { open, writeFile, stat, readdir, mkdir, rename, copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Platform } from '../platform';
import { object, string, type SdkContext } from './context';
import { runProcess, type ProcessRequest } from './process';
import type { PluginTasks } from './tasks';

const PATHS = ['home', 'appData', 'userData', 'temp', 'exe', 'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos', 'logs'] as const;
export class PluginSystem {
  private notifications = new Map<number, Set<Notification>>();
  constructor(private tasks: PluginTasks, private platform: Platform) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    const args = () => object(value);
    if (method === 'system.info') return { platform: process.platform, arch: process.arch, release: os.release(), version: app.getVersion(), electron: process.versions.electron, locale: app.getLocale(), dark: nativeTheme.shouldUseDarkColors, packaged: app.isPackaged };
    if (method === 'system.path') {
      context.require('files'); const name = string(value) as typeof PATHS[number];
      if (!PATHS.includes(name)) throw new Error(t("路径名称无效")); return app.getPath(name);
    }
    if (method.startsWith('files.') || ['system.fileIcon', 'system.openPath', 'system.reveal', 'system.trash'].includes(method)) {
      context.require('files');
      const a = args(), file = string(a.path);
      if (!path.isAbsolute(file)) throw new Error(t("文件路径必须为绝对路径"));
      switch (method) {
        case 'files.read': {
          const handle = await open(file, 'r');
          try { const info = await handle.stat(); if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error(t("文件必须小于 16 MB"));
            const buffer = Buffer.alloc(Math.min(info.size + 1, 16 * 1024 * 1024 + 1));
            let bytesRead = 0; while (bytesRead < buffer.length) { const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead); if (!chunk.bytesRead) break; bytesRead += chunk.bytesRead; }
            if (bytesRead > 16 * 1024 * 1024) throw new Error(t("文件超过 16 MB"));
            return new Uint8Array(buffer.subarray(0, bytesRead));
          } finally { await handle.close(); }
        }
        case 'files.write': {
          if (!(a.data instanceof Uint8Array) || a.data.byteLength > 16 * 1024 * 1024) throw new Error(t("文件内容无效或超过 16 MB"));
          await writeFile(file, a.data, { flag: a.overwrite === true ? 'w' : 'wx', mode: 0o600 }); return true;
        }
        case 'files.stat': { const info = await stat(file); return { size: info.size, directory: info.isDirectory(), modifiedAt: info.mtimeMs, createdAt: info.birthtimeMs }; }
        case 'files.list': return (await readdir(file, { withFileTypes: true })).map(entry => ({ name: entry.name, directory: entry.isDirectory(), symbolicLink: entry.isSymbolicLink() }));
        case 'files.mkdir': await mkdir(file, { recursive: a.recursive === true }); return true;
        case 'files.rename': { const to = string(a.to); if (!path.isAbsolute(to)) throw new Error(t("目标路径必须为绝对路径")); await rename(file, to); return true; }
        case 'files.copy': { const to = string(a.to); if (!path.isAbsolute(to)) throw new Error(t("目标路径必须为绝对路径")); await copyFile(file, to, a.overwrite === true ? 0 : 1); return true; }
        case 'files.remove': await unlink(file); return true;
        case 'system.fileIcon': return (await app.getFileIcon(file, { size: 'normal' })).toDataURL();
        case 'system.openPath': { const error = await shell.openPath(file); if (error) throw new Error(error); return true; }
        case 'system.reveal': shell.showItemInFolder(file); return true;
        case 'system.trash': await shell.trashItem(file); return true;
      }
    }
    if (method === 'process.run') {
      context.require('process'); const a = args(), id = string(a.id, 100);
      return this.tasks.run(context.contents.id, id, Number(a.timeoutMs ?? 30000), signal => runProcess(a as unknown as ProcessRequest, signal, value => context.emit('progress', { id, value })));
    }
    if (method.startsWith('dialogs.')) {
      const a = object(value ?? {});
      if (method === 'dialogs.message') return dialog.showMessageBox(context.owner, { message: string(a.message, 5000), title: typeof a.title === 'string' ? a.title : context.record.manifest.name, buttons: Array.isArray(a.buttons) ? a.buttons.map(v => string(v, 100)).slice(0, 10) : [t("确定")], detail: typeof a.detail === 'string' ? a.detail.slice(0, 10000) : undefined });
      context.require('files');
      const options = { title: typeof a.title === 'string' ? a.title : undefined, defaultPath: typeof a.defaultPath === 'string' ? a.defaultPath : undefined, filters: Array.isArray(a.filters) ? a.filters.map(filter => { const f = object(filter); if (!Array.isArray(f.extensions)) throw new Error(t("文件筛选无效")); return { name: string(f.name, 100), extensions: f.extensions.map(e => string(e, 20)) }; }) : undefined };
      if (method === 'dialogs.open') return dialog.showOpenDialog(context.owner, { ...options, properties: [a.directory === true ? 'openDirectory' : 'openFile', ...(a.multiple === true ? ['multiSelections' as const] : [])] });
      if (method === 'dialogs.save') return dialog.showSaveDialog(context.owner, options);
    }
    if (method === 'notifications.show') {
      context.require('notifications'); if (!Notification.isSupported()) throw new Error(t("当前平台不支持系统通知"));
      const a = args(), id = string(a.id, 100), notification = new Notification({ title: string(a.title, 200), body: string(a.body, 2000), silent: a.silent === true });
      let active = this.notifications.get(context.contents.id); if (!active) { active = new Set(); this.notifications.set(context.contents.id, active); }
      if (active.size >= 10) throw new Error(t("同时显示的通知超过 10 个")); active.add(notification);
      notification.once('close', () => { active.delete(notification); if (!active.size) this.notifications.delete(context.contents.id); });
      notification.once('click', () => context.emit('notification', { id })); notification.show(); return true;
    }
    if (method === 'clipboard.readImage') {
      context.require('clipboard.read');
      for (const item of await clipboard.read()) if (item.types.includes('image/png')) { const blob = await item.getType('image/png'); if (blob.size > 16 * 1024 * 1024) throw new Error(t("剪贴板图片过大")); return new Uint8Array(await blob.arrayBuffer()); }
      return null;
    }
    if (method === 'clipboard.writeImage') {
      context.require('clipboard.write'); if (!(value instanceof Uint8Array) || value.byteLength > 16 * 1024 * 1024) throw new Error(t("图片无效"));
      const image = nativeImage.createFromBuffer(Buffer.from(value)); if (image.isEmpty()) throw new Error(t("图片无法解码"));
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())]) })]); return true;
    }
    if (method === 'clipboard.readFiles') { context.require('clipboard.read'); return this.platform.readFiles(); }
    if (method === 'clipboard.writeFiles') {
      context.require('clipboard.write'); context.require('files');
      if (!Array.isArray(value) || !value.length || value.length > 256) throw new Error(t("文件列表无效"));
      const files = value.map(v => string(v)); if (files.some(file => !path.isAbsolute(file))) throw new Error(t("文件路径必须为绝对路径"));
      await this.platform.writeFiles(files); return true;
    }
    if (method === 'input.paste') { context.require('input.simulate'); context.owner.hide(); await this.platform.paste(); return true; }
    if (method === 'input.drag') {
      context.require('files'); const a = args();
      if (!Array.isArray(a.files) || !a.files.length || a.files.length > 256) throw new Error(t("拖拽文件无效"));
      const files = a.files.map(v => string(v)); if (files.some(file => !path.isAbsolute(file))) throw new Error(t("文件路径必须为绝对路径"));
      const icon = typeof a.icon === 'string' ? nativeImage.createFromDataURL(a.icon) : await app.getFileIcon(files[0]);
      if (icon.isEmpty()) throw new Error(t("拖拽图标无效")); context.contents.startDrag({ file:files[0], files, icon }); return true;
    }
    throw new Error(t("不支持的系统 API"));
  }
  closeSession(owner: number): void { for (const notification of this.notifications.get(owner) ?? []) notification.close(); this.notifications.delete(owner); }
  close(): void { for (const owner of this.notifications.keys()) this.closeSession(owner); }
}
