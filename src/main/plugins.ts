import { BrowserWindow, clipboard, dialog, ipcMain, session, shell, nativeImage } from 'electron';
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gt } from 'semver';
import type { Store } from './store';
import { readPluginDirectory, readPluginZip, type PluginBundle } from './plugin-bundle';
import { safeEntryPath } from '../shared/plugin-validation';
import type { Command, PluginRecord, PluginPermission } from '../shared/types';

const PERMISSION_LABELS: Record<PluginPermission, string> = { 'clipboard.read':'读取当前系统剪贴板文本', 'clipboard.write':'写入系统剪贴板文本', 'shell.openExternal':'使用系统浏览器打开 HTTP / HTTPS 链接' };
const MIME: Record<string, string> = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export class PluginManager {
  private installing=false;
  private running = new Map<string, BrowserWindow>();
  private callers = new Map<number, { record: PluginRecord; code: string; payload: string }>();
  private root: string;
  constructor(private store: Store, private changed: (event?: string) => void) {
    this.root = path.join(store.directory, 'plugins');
    ipcMain.handle('plugin-api', async (event, method: unknown, args: unknown) => {
      const caller = this.callers.get(event.sender.id);
      const frame = event.senderFrame;
      if (!caller || frame !== event.sender.mainFrame || !frame?.url.startsWith(`nexlet-plugin://${caller.record.manifest.id}/`)) throw new Error('插件调用来源无效');
      const { record } = caller;
      if (!this.records().find(p => p.manifest.id === record.manifest.id)?.enabled) throw new Error('插件已停用');
      const requirePermission = (permission: PluginPermission) => { if (!record.manifest.permissions.includes(permission)) throw new Error(`未授权：${permission}`); };
      const key = () => { if (typeof args !== 'object' || !args) throw new Error('参数无效'); const value = (args as {key?:unknown}).key; if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(value) || ['__proto__','constructor','prototype'].includes(value)) throw new Error('存储键无效'); return value; };
      switch (method) {
        case 'info': return { name:record.manifest.name, version:record.manifest.version, code:caller.code, payload:caller.payload };
        case 'storage.get': { const data = this.store.get<Record<string,unknown>>('plugin-data:' + record.manifest.id, {}); const name=key(); return Object.hasOwn(data,name) ? data[name] : null; }
        case 'storage.set': {
          const name=key(); const data = this.store.get<Record<string,unknown>>('plugin-data:' + record.manifest.id, {});
          data[name]=(args as {value:unknown}).value;
          if (Buffer.byteLength(JSON.stringify(data)) > 1024 * 1024) throw new Error('插件存储超过 1 MB 配额');
          this.store.set('plugin-data:' + record.manifest.id, data); return true;
        }
        case 'clipboard.readText': requirePermission('clipboard.read'); return (await clipboard.readText()).slice(0, 2 * 1024 * 1024);
        case 'clipboard.writeText': {
          requirePermission('clipboard.write'); if (typeof args !== 'string' || args.length > 1024 * 1024) throw new Error('文本长度无效'); await clipboard.writeText(args); return true;
        }
        case 'openExternal': {
          requirePermission('shell.openExternal'); if (typeof args !== 'string' || args.length > 2048) throw new Error('链接无效');
          const url=new URL(args); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('只允许 HTTP / HTTPS 链接'); await shell.openExternal(url.href); return true;
        }
        default: throw new Error('不支持的插件 API');
      }
    });
  }
  records(): PluginRecord[] { return this.store.get<PluginRecord[]>('plugins', []); }
  commands(): Command[] { return this.records().filter(p=>p.enabled).flatMap(p => p.manifest.features.map(f => ({ id:`plugin:${p.manifest.id}:${f.code}`, name:f.name, subtitle:p.manifest.name, kind:'plugin' as const, keywords:f.keywords, pluginId:p.manifest.id, feature:f.code, color:'#8b80d9',icon:p.icon }))); }
  async install(owner: BrowserWindow, development: boolean): Promise<boolean> {
    const picked = await dialog.showOpenDialog(owner, { title:development ? '选择插件开发目录' : '导入 Nexlet 插件包', properties:development ? ['openDirectory'] : ['openFile'], ...(development ? {} : {filters:[{name:'Nexlet 插件',extensions:['zip','nexlet']}]}) });
    if (picked.canceled || !picked.filePaths[0]) return false;
    const source = picked.filePaths[0];
    const bundle = development ? await readPluginDirectory(source) : readPluginZip(await readFile(source));
    return this.installBundle(owner,bundle,{source:'local',developmentDirectory:development?source:undefined});
  }
  async installBundle(owner:BrowserWindow,bundle:PluginBundle,options:{source:'marketplace'|'local';developmentDirectory?:string}):Promise<boolean>{
    if(this.installing)throw new Error('请等待当前插件安装完成');this.installing=true;
    try{return await this.applyBundle(owner,bundle,options);}finally{this.installing=false;}
  }
  private async applyBundle(owner:BrowserWindow,bundle:PluginBundle,options:{source:'marketplace'|'local';developmentDirectory?:string}):Promise<boolean>{
    const development=!!options.developmentDirectory;
    const previous = this.records().find(p=>p.manifest.id===bundle.manifest.id);
    if(options.source==='marketplace'&&previous?.development)throw new Error('开发目录插件请通过本地方式更新');
    if(options.source==='marketplace'&&previous&&!gt(bundle.manifest.version,previous.manifest.version))throw new Error('已安装相同或更新版本，请刷新市场');
    let icon:string|undefined;
    if(bundle.manifest.icon){const image=nativeImage.createFromBuffer(bundle.files.get(bundle.manifest.icon)!);if(image.isEmpty())throw new Error('插件 PNG 图标无法解码');icon=image.resize({width:64,height:64}).toDataURL();}
    const prompt = await dialog.showMessageBox(owner, { type:'question', title:'确认插件权限', message:`${previous ? '更新' : '安装'} ${bundle.manifest.name} ${bundle.manifest.version}`, detail:`${bundle.manifest.description}\n\n${previous ? `已安装版本：${previous.manifest.version}\n` : ''}需要的能力：\n${bundle.manifest.permissions.map(p=>'• '+PERMISSION_LABELS[p]).join('\n') || '仅插件独立存储，无系统权限'}\n\n${development ? '开发目录直接加载，重新打开可读取文件更新。' : '插件将在隔离窗口运行。'}`, buttons:['取消','允许并安装'], defaultId:0, cancelId:0 });
    if (prompt.response !== 1) return false;
    const directory = development ? await realpath(options.developmentDirectory!) : path.join(this.root, bundle.manifest.id, randomUUID());
    if (!development) {
      try { for (const [name,data] of bundle.files) { const file=path.join(directory,name); await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,data,{mode:0o600}); } }
      catch (error) { await this.removeManaged(directory); throw error; }
    }
    this.running.get(bundle.manifest.id)?.close();
    const record: PluginRecord={manifest:bundle.manifest,directory,enabled:true,development,installedAt:Date.now(),source:options.source,icon};
    try{this.store.set('plugins',[...this.records().filter(p=>p.manifest.id!==record.manifest.id),record]);}catch(e){if(!development)await this.removeManaged(directory);throw e;}
    if (previous && !previous.development) await this.removeManaged(previous.directory).catch(()=>{});
    this.changed(); return true;
  }
  toggle(id: string, enabled: boolean): void { const records=this.records(); const record=records.find(p=>p.manifest.id===id); if(!record)throw new Error('插件不存在'); record.enabled=enabled; if(!enabled)this.running.get(id)?.close(); this.store.set('plugins',records); this.changed(); }
  async remove(id: string, deleteData: boolean): Promise<void> { const record=this.records().find(p=>p.manifest.id===id); if(!record)throw new Error('插件不存在'); this.running.get(id)?.close(); this.store.set('plugins',this.records().filter(p=>p.manifest.id!==id)); if(!record.development)await this.removeManaged(record.directory); if(deleteData)this.store.set('plugin-data:'+id,{}); this.changed(); }
  async launch(id: string, code: string, payload = ''): Promise<void> {
    const record=this.records().find(p=>p.manifest.id===id && p.enabled); if(!record)throw new Error('插件未安装或已停用');
    if(!record.manifest.features.some(f=>f.code===code))throw new Error('功能不存在');
    const existing=this.running.get(id);
    if(existing && !existing.isDestroyed()) { this.callers.set(existing.webContents.id,{record,code,payload}); existing.webContents.send('plugin-activate',{code,payload}); existing.show(); existing.focus(); return; }
    const root=await realpath(record.directory);
    const partition=`nexlet-plugin-${id}-${randomUUID()}`;
    const isolated=session.fromPartition(partition);
    isolated.setPermissionCheckHandler(()=>false); isolated.setPermissionRequestHandler((_c,_p,reply)=>reply(false));
    isolated.webRequest.onBeforeRequest((details,reply)=>{const url=new URL(details.url); reply({cancel:!(url.protocol==='nexlet-plugin:' && url.hostname===id) && !['data:','blob:'].includes(url.protocol)});});
    isolated.protocol.handle('nexlet-plugin',async request=>{
      try {
        const url=new URL(request.url); if(url.hostname!==id)throw new Error('来源不符');
        const relative=safeEntryPath(decodeURIComponent(url.pathname.slice(1)));
        const file=await realpath(path.join(root,relative)); const relation=path.relative(root,file);
        if(relation.startsWith('..') || path.isAbsolute(relation))throw new Error('资源不在插件目录中');
        const bytes=await readFile(file); if(bytes.length>10*1024*1024)throw new Error('文件过大');
        return new Response(bytes,{headers:{'Content-Type':MIME[path.extname(file)] || 'application/octet-stream','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});
      } catch { return new Response('无法读取插件资源',{status:403}); }
    });
    const window=new BrowserWindow({width:800,height:600,minWidth:500,minHeight:350,title:record.manifest.name,autoHideMenuBar:true,backgroundColor:'#f4f4f4',webPreferences:{preload:path.join(__dirname,'../preload/plugin.cjs'),partition,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',e=>e.preventDefault());
    window.webContents.on('will-attach-webview',e=>e.preventDefault());
    this.running.set(id,window); this.callers.set(window.webContents.id,{record,code,payload});
    const contentsId=window.webContents.id;
    window.on('closed',()=>{this.running.delete(id);this.callers.delete(contentsId);void isolated.clearStorageData();});
    window.webContents.on('render-process-gone',()=>{if(!window.isDestroyed())window.close();this.changed(`error:插件「${record.manifest.name}」意外退出，可以重新打开`);});
    window.on('unresponsive',()=>{if(!window.isDestroyed())window.destroy();this.changed(`error:插件「${record.manifest.name}」无响应，已关闭其窗口`);});
    await window.loadURL(`nexlet-plugin://${id}/${record.manifest.main}`);
  }
  close(): void { for(const window of this.running.values())if(!window.isDestroyed())window.close(); }
  private async removeManaged(directory: string): Promise<void> { const relative=path.relative(path.resolve(this.root),path.resolve(directory)); if(!relative || relative.startsWith('..') || path.isAbsolute(relative))throw new Error('拒绝清理非托管插件目录'); await rm(directory,{recursive:true,force:true}); }
}
