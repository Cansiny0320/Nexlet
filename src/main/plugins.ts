import { localizedLabels, localizedKeywords } from '../shared/plugin-locales';
import { t } from '../shared/i18n';
import { BrowserWindow, clipboard, dialog, ipcMain, shell, nativeImage, net, safeStorage } from 'electron';
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
import { PluginNetwork } from './plugin-network';
import { PluginSecrets } from './plugin-secrets';
import { PluginSdk } from './plugin-sdk';
import type { Platform } from './platform';
interface InstallOptions { source:'marketplace'|'local'; developmentDirectory?:string; canReplace?:()=>boolean; }

export class PluginManager {
  private installing=false;
  readonly network=new PluginNetwork((url,init)=>net.fetch(url,init));
  readonly secrets:PluginSecrets;
  readonly runtime:PluginRuntime;
  readonly sdk:PluginSdk;
  updateOnLaunch:((record:PluginRecord,code:string,signal:AbortSignal)=>Promise<PluginBundle|null>)|null=null;
  private root: string;
  constructor(private store: Store, private changed: (event?: string) => void,private inputs:LaunchInputs,platform?:Platform) {
    this.root = path.join(store.directory, 'plugins');
    this.secrets=new PluginSecrets(store,safeStorage);
    this.sdk=new PluginSdk(store,()=>this.records(),platform,this.secrets);
    this.runtime=new PluginRuntime(inputs,id=>{this.network.close(id);this.secrets.close(id);this.sdk.closeSession(id);},(from,to)=>this.sdk.commands?.move(from,to));
    this.sdk.configureUi({
      register:(parent,window)=>{const caller=this.runtime.callers.get(parent);if(!caller)throw new Error(t("父插件会话已结束"));this.runtime.callers.set(window.webContents.id,caller);const id=window.webContents.id;return()=>{this.runtime.callers.delete(id);this.inputs.revoke(id);this.network.close(id);this.secrets.close(id);this.sdk.closeSession(id);};},
      detach:owner=>this.runtime.detach(owner),exit:plugin=>this.runtime.stop(plugin)
    },()=>this.changed(),(plugin,code,payload)=>this.launch(plugin,code,payload));
    ipcMain.handle('plugin-api', async (event, method: unknown, args: unknown) => {
      const caller = this.runtime.callers.get(event.sender.id);
      const frame = event.senderFrame;
      if (!caller || frame !== event.sender.mainFrame || !frame?.url.startsWith(`nexlet-plugin://${caller.record.manifest.id}/`)) throw new Error(t("插件调用来源无效"));
      const { record } = caller;
      if(method==='ready'){if(event.sender.id===caller.view.webContents.id)this.runtime.ready(event.sender.id);else{event.sender.send('plugin-lifecycle',{event:'ready',sequence:0});event.sender.send('plugin-lifecycle',{event:'enter',value:inputContext(caller.input,caller.code),sequence:0});}return true;}
      if(method==='lifecycleAck'){this.runtime.acknowledge(event.sender.id,args);return true;}
      // onOut may finish local persistence and release the backend; new work stays blocked.
      if(caller.closing&&(typeof method!=='string'||!['storage.get','storage.set','database.put','database.remove','secrets.set','backend.stop'].includes(method)))throw new Error(t("插件会话已结束"));
      if (!this.records().find(p => p.manifest.id === record.manifest.id)?.enabled) throw new Error(t("插件已停用"));
      const requirePermission = (permission: PluginPermission) => { if (!record.manifest.permissions.includes(permission)) throw new Error(t("未授权：{{v0}}", { v0: permission })); };
      const key = () => { if (typeof args !== 'object' || !args) throw new Error(t("参数无效")); const value = (args as {key?:unknown}).key; if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(value) || ['__proto__','constructor','prototype'].includes(value)) throw new Error(t("存储键无效")); return value; };
      switch (method) {
        case 'network.request': {
          requirePermission('network.request');
          return this.network.request(event.sender.id,args);
        }
        case 'network.cancel':requirePermission('network.request');return this.network.cancel(event.sender.id,args);
        case 'network.resetPermissions':requirePermission('network.request');this.network.close(event.sender.id);this.store.set('plugin-network:'+record.manifest.id,[]);return true;
        case 'secrets.get':requirePermission('secrets');return this.secrets.get(record.manifest.id,event.sender.id,key());
        case 'secrets.set':requirePermission('secrets');return this.secrets.set(record.manifest.id,event.sender.id,key(),(args as {value:unknown}).value);
        case 'info': return { name:localizedLabels(record.manifest).name, version:record.manifest.version, code:caller.code, payload:caller.payload };
        case 'context':return inputContext(caller.input,caller.code);
        case 'input.read':return this.inputs.read(caller.view.webContents.id,args);
        case 'storage.get': { const data = this.store.get<Record<string,unknown>>('plugin-data:' + record.manifest.id, {}); const name=key(); return Object.hasOwn(data,name) ? data[name] : null; }
        case 'storage.set': {
          const name=key(); const data = this.store.get<Record<string,unknown>>('plugin-data:' + record.manifest.id, {});
          data[name]=(args as {value:unknown}).value;
          if (Buffer.byteLength(JSON.stringify(data)) > 1024 * 1024) throw new Error(t("插件存储超过 1 MB 配额"));
          this.store.set('plugin-data:' + record.manifest.id, data); return true;
        }
        case 'clipboard.readText': requirePermission('clipboard.read'); return (await clipboard.readText()).slice(0, 2 * 1024 * 1024);
        case 'clipboard.writeText': {
          requirePermission('clipboard.write'); if (typeof args !== 'string' || args.length > 1024 * 1024) throw new Error(t("文本长度无效")); await clipboard.writeText(args); return true;
        }
        case 'openExternal': {
          requirePermission('shell.openExternal'); if (typeof args !== 'string' || args.length > 2048) throw new Error(t("链接无效"));
          const url=new URL(args); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error(t("只允许 HTTP / HTTPS 链接")); await shell.openExternal(url.href); return true;
        }
        default: return this.sdk.invoke({record,contents:event.sender,owner:BrowserWindow.fromWebContents(event.sender)||caller.owner,hostOwner:caller.owner,isolated:caller.isolated},method,args);
      }
    });
  }
  records(): PluginRecord[] { return this.store.get<PluginRecord[]>('plugins', []); }
  commands(): Command[] { return this.records().filter(p=>p.enabled).flatMap(p => (this.sdk.commands?.features(p)||p.manifest.features).map(f => ({ id:`plugin:${p.manifest.id}:${f.code}`, name:localizedLabels(f).name, subtitle:localizedLabels(p.manifest).name, kind:'plugin' as const, keywords:localizedKeywords(f), pluginId:p.manifest.id, feature:f.code, color:'#8b80d9',icon:p.icon,matches:f.matches }))); }
  async install(owner: BrowserWindow, development: boolean): Promise<boolean> {
    const picked = await dialog.showOpenDialog(owner, { title:development ? t("选择插件开发目录") : t("导入 Nexlet 插件包"), properties:development ? ['openDirectory'] : ['openFile'], ...(development ? {} : {filters:[{name:t("Nexlet 插件"),extensions:['zip','nexlet']}]}) });
    if (picked.canceled || !picked.filePaths[0]) return false;
    const source = picked.filePaths[0];
    const bundle = development ? await readPluginDirectory(source) : readPluginZip(await readFile(source));
    return this.installBundle(owner,bundle,{source:'local',developmentDirectory:development?source:undefined});
  }
  async installBundle(owner:BrowserWindow,bundle:PluginBundle,options:{source:'marketplace'|'local';developmentDirectory?:string}):Promise<boolean>{
    return this.replaceBundle(bundle,options);
  }
  private async replaceBundle(bundle:PluginBundle,options:InstallOptions):Promise<boolean>{
    if(this.installing)throw new Error(t("请等待当前插件安装完成"));this.installing=true;
    try{return await this.applyBundle(bundle,options);}finally{this.installing=false;}
  }
  private async applyBundle(bundle:PluginBundle,options:InstallOptions):Promise<boolean>{
    if(options.canReplace&&!options.canReplace())return false;
    const development=!!options.developmentDirectory;
    const previous = this.records().find(p=>p.manifest.id===bundle.manifest.id);
    if(options.source==='marketplace'&&previous?.development)throw new Error(t("开发目录插件请通过本地方式更新"));
    if(options.source==='marketplace'&&previous&&!gt(bundle.manifest.version,previous.manifest.version))throw new Error(t("已安装相同或更新版本，请刷新市场"));
    let icon:string|undefined;
    if(bundle.manifest.icon){const image=nativeImage.createFromBuffer(bundle.files.get(bundle.manifest.icon)!);if(image.isEmpty())throw new Error(t("插件 PNG 图标无法解码"));icon=image.resize({width:64,height:64}).toDataURL();}
    const directory = development ? await realpath(options.developmentDirectory!) : path.join(this.root, bundle.manifest.id, randomUUID());
    if (!development) {
      try { for (const [name,data] of bundle.files) { const file=path.join(directory,name); await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,data,{mode:0o600}); } }
      catch (error) { await this.removeManaged(directory); throw error; }
    }
    if(options.canReplace){
      // A launch update must never stop a live session or revive a removed/disabled plugin.
      if(!options.canReplace()){if(!development)await this.removeManaged(directory);return false;}
    }else await this.runtime.stop(bundle.manifest.id);
    this.sdk.stop(bundle.manifest.id);
    const record: PluginRecord={manifest:bundle.manifest,directory,enabled:true,development,installedAt:Date.now(),source:options.source,icon};
    try{this.store.set('plugins',[...this.records().filter(p=>p.manifest.id!==record.manifest.id),record]);}catch(e){if(!development)await this.removeManaged(directory);throw e;}
    if (previous && !previous.development) await this.removeManaged(previous.directory).catch(()=>{});
    this.changed(); return true;
  }
  async toggle(id: string, enabled: boolean): Promise<void> { const records=this.records(); const record=records.find(p=>p.manifest.id===id); if(!record)throw new Error(t("插件不存在")); record.enabled=enabled; if(!enabled){await this.runtime.stop(id);this.sdk.stop(id);} this.store.set('plugins',records); this.changed(); }
  async remove(id: string, deleteData: boolean): Promise<void> { const record=this.records().find(p=>p.manifest.id===id); if(!record)throw new Error(t("插件不存在")); await this.runtime.stop(id); this.store.set('plugins',this.records().filter(p=>p.manifest.id!==id)); if(!record.development)await this.removeManaged(record.directory); this.sdk.stop(id); if(deleteData){await this.sdk.clear(id);await rm(path.join(this.store.directory,'plugin-backends',id),{recursive:true,force:true});this.store.set('plugin-data:'+id,{});this.secrets.remove(id);this.store.set('plugin-network:'+id,[]);} this.changed(); }
  async launch(id:string,code:string,payload='',snapshot?:InputSnapshot):Promise<void>{
    const record=this.records().find(p=>p.manifest.id===id&&p.enabled);
    if(!record)throw new Error(t("插件未安装或已停用"));
    if(!(this.sdk.commands?.features(record)||record.manifest.features).some(f=>f.code===code))throw new Error(t("功能不存在"));
    await this.runtime.launch(record,code,snapshot||{input:{...textInput(payload),id:randomUUID()},resources:new Map()},async(isCurrent,signal)=>{
      const canReplace=()=>isCurrent()&&!this.runtime.sessions.has(id)&&this.records().some(p=>p.manifest.id===id&&p.directory===record.directory&&p.enabled&&p.source==='marketplace'&&!p.development);
      if(this.updateOnLaunch&&canReplace()){
        try{const bundle=await this.updateOnLaunch(record,code,signal);if(bundle&&canReplace())await this.replaceBundle(bundle,{source:'marketplace',canReplace});}catch{/* Keep the installed version if an update cannot be applied. */}
      }
      return this.records().find(p=>p.manifest.id===id&&p.enabled)||record;
    });
  }
  close():Promise<void>{this.sdk.close();return this.runtime.close();}
  private async removeManaged(directory: string): Promise<void> { const relative=path.relative(path.resolve(this.root),path.resolve(directory)); if(!relative || relative.startsWith('..') || path.isAbsolute(relative))throw new Error(t("拒绝清理非托管插件目录")); await rm(directory,{recursive:true,force:true}); }
}
