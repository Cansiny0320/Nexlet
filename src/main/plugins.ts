import { BrowserWindow, clipboard, dialog, ipcMain, shell, nativeImage } from 'electron';
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gt } from 'semver';
import { PluginRuntime } from './plugin-runtime';
import type { Store } from './store';
import { readPluginDirectory, readPluginZip, type PluginBundle } from './plugin-bundle';
import type { Command, PluginRecord, PluginPermission } from '../shared/types';
import { inputContext, textInput } from '../shared/launch';
import type { LaunchInputs, InputSnapshot } from './launch-input';

const PERMISSION_LABELS: Record<PluginPermission, string> = { 'clipboard.read':'读取当前系统剪贴板文本', 'clipboard.write':'写入系统剪贴板文本', 'shell.openExternal':'使用系统浏览器打开 HTTP / HTTPS 链接' };
export class PluginManager {
  private installing=false;
  readonly runtime:PluginRuntime;
  private root: string;
  constructor(private store: Store, private changed: (event?: string) => void,private inputs:LaunchInputs) {
    this.root = path.join(store.directory, 'plugins');
    this.runtime=new PluginRuntime(inputs);
    ipcMain.handle('plugin-api', async (event, method: unknown, args: unknown) => {
      const caller = this.runtime.callers.get(event.sender.id);
      const frame = event.senderFrame;
      if (!caller || frame !== event.sender.mainFrame || !frame?.url.startsWith(`nexlet-plugin://${caller.record.manifest.id}/`)) throw new Error('插件调用来源无效');
      const { record } = caller;
      if(method==='ready'){this.runtime.ready(event.sender.id);return true;}
      if(method==='lifecycleAck'){this.runtime.acknowledge(event.sender.id,args);return true;}
      if (!this.records().find(p => p.manifest.id === record.manifest.id)?.enabled) throw new Error('插件已停用');
      const requirePermission = (permission: PluginPermission) => { if (!record.manifest.permissions.includes(permission)) throw new Error(`未授权：${permission}`); };
      const key = () => { if (typeof args !== 'object' || !args) throw new Error('参数无效'); const value = (args as {key?:unknown}).key; if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(value) || ['__proto__','constructor','prototype'].includes(value)) throw new Error('存储键无效'); return value; };
      switch (method) {
        case 'info': return { name:record.manifest.name, version:record.manifest.version, code:caller.code, payload:caller.payload };
        case 'context':return inputContext(caller.input,caller.code);
        case 'input.read':return this.inputs.read(event.sender.id,args);
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
  commands(): Command[] { return this.records().filter(p=>p.enabled).flatMap(p => p.manifest.features.map(f => ({ id:`plugin:${p.manifest.id}:${f.code}`, name:f.name, subtitle:p.manifest.name, kind:'plugin' as const, keywords:f.keywords, pluginId:p.manifest.id, feature:f.code, color:'#8b80d9',icon:p.icon,matches:f.matches }))); }
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
    const prompt = await dialog.showMessageBox(owner, { type:'question', title:'确认插件权限', message:`${previous ? '更新' : '安装'} ${bundle.manifest.name} ${bundle.manifest.version}`, detail:`${bundle.manifest.description}\n\n${previous ? `已安装版本：${previous.manifest.version}\n` : ''}需要的能力：\n${bundle.manifest.permissions.map(p=>'• '+PERMISSION_LABELS[p]).join('\n') || '仅插件独立存储，无系统权限'}\n\n${development ? '开发目录直接加载，重新打开可读取文件更新。' : '插件将在隔离会话中内嵌运行，可分离为独立窗口。'}`, buttons:['取消','允许并安装'], defaultId:0, cancelId:0 });
    if (prompt.response !== 1) return false;
    const directory = development ? await realpath(options.developmentDirectory!) : path.join(this.root, bundle.manifest.id, randomUUID());
    if (!development) {
      try { for (const [name,data] of bundle.files) { const file=path.join(directory,name); await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,data,{mode:0o600}); } }
      catch (error) { await this.removeManaged(directory); throw error; }
    }
    await this.runtime.stop(bundle.manifest.id);
    const record: PluginRecord={manifest:bundle.manifest,directory,enabled:true,development,installedAt:Date.now(),source:options.source,icon};
    try{this.store.set('plugins',[...this.records().filter(p=>p.manifest.id!==record.manifest.id),record]);}catch(e){if(!development)await this.removeManaged(directory);throw e;}
    if (previous && !previous.development) await this.removeManaged(previous.directory).catch(()=>{});
    this.changed(); return true;
  }
  async toggle(id: string, enabled: boolean): Promise<void> { const records=this.records(); const record=records.find(p=>p.manifest.id===id); if(!record)throw new Error('插件不存在'); record.enabled=enabled; if(!enabled)await this.runtime.stop(id); this.store.set('plugins',records); this.changed(); }
  async remove(id: string, deleteData: boolean): Promise<void> { const record=this.records().find(p=>p.manifest.id===id); if(!record)throw new Error('插件不存在'); await this.runtime.stop(id); this.store.set('plugins',this.records().filter(p=>p.manifest.id!==id)); if(!record.development)await this.removeManaged(record.directory); if(deleteData)this.store.set('plugin-data:'+id,{}); this.changed(); }
  async launch(id:string,code:string,payload='',snapshot?:InputSnapshot):Promise<void>{
    const record=this.records().find(p=>p.manifest.id===id&&p.enabled);
    if(!record)throw new Error('插件未安装或已停用');
    if(!record.manifest.features.some(f=>f.code===code))throw new Error('功能不存在');
    await this.runtime.launch(record,code,snapshot||{input:{...textInput(payload),id:randomUUID()},resources:new Map()});
  }
  close():Promise<void>{return this.runtime.close();}
  private async removeManaged(directory: string): Promise<void> { const relative=path.relative(path.resolve(this.root),path.resolve(directory)); if(!relative || relative.startsWith('..') || path.isAbsolute(relative))throw new Error('拒绝清理非托管插件目录'); await rm(directory,{recursive:true,force:true}); }
}
